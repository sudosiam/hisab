import {
  getDatabase,
  getPaymentStatus,
  recomputeProductStock,
  recordTransaction,
  reduceInventory,
  repairFinancialDataIntegrity,
  reverseTransactionsByReference,
} from '../db/database';
import { resolveSaleInvoiceNo, syncNextInvoiceSettingAfterUse } from './invoiceNumbers';
import { upsertParty } from './parties';
import { formatCurrency } from '../utils/format';
import { addMoney, mulMoney, roundMoney, subMoney } from '../utils/money';
import type { PaymentInput, Sale, SaleItem, SaleItemInput, SalePayment } from '../types';

function validateSaleItems(items: SaleItemInput[]): void {
  if (items.length === 0) throw new Error('Add at least one item');
  for (const item of items) {
    if (item.qty <= 0) throw new Error('Item quantity must be greater than zero');
    if (item.unit_price <= 0) throw new Error('Item unit price must be greater than zero');
  }
}

function validatePaymentAmount(
  totalAmount: number,
  paidAmount: number,
  paymentAmount: number
): void {
  if (paymentAmount <= 0) throw new Error('Payment amount must be greater than zero');
  const remaining = subMoney(totalAmount, paidAmount);
  if (paymentAmount > remaining + 0.01) {
    throw new Error(`Payment exceeds amount due (${formatCurrency(remaining)} remaining)`);
  }
}

async function assertActivePaymentAccount(
  db: Awaited<ReturnType<typeof getDatabase>>,
  accountId: number
): Promise<void> {
  const account = await db.getFirstAsync<{ id: number; is_excluded: number }>(
    'SELECT id, is_excluded FROM accounts WHERE id = ?',
    [accountId]
  );
  if (!account) throw new Error('Please select a valid bank/cash account');
  if (account.is_excluded) {
    throw new Error('Cannot use an excluded account for sale payments');
  }
}

export async function getSales(
  filter?: 'all' | 'paid' | 'unpaid',
  options?: { limit?: number; offset?: number }
): Promise<Sale[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM sales ORDER BY date DESC, id DESC';
  const params: (string | number)[] = [];

  if (filter === 'paid') {
    query = `SELECT * FROM sales WHERE status = 'paid' ORDER BY date DESC, id DESC`;
  } else if (filter === 'unpaid') {
    query = `SELECT * FROM sales WHERE status IN ('unpaid', 'partial') ORDER BY date DESC, id DESC`;
  }

  if (options?.limit) {
    query += ' LIMIT ? OFFSET ?';
    params.push(options.limit, options.offset ?? 0);
  }

  return db.getAllAsync<Sale>(query, params);
}

export async function getSaleById(id: number): Promise<Sale | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Sale>('SELECT * FROM sales WHERE id = ?', [id]);
}

export async function getSaleItems(saleId: number): Promise<SaleItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<SaleItem>(
    `SELECT si.*, p.name as product_name FROM sale_items si
     JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = ?`,
    [saleId]
  );
}

export async function getSalePayments(saleId: number): Promise<SalePayment[]> {
  const db = await getDatabase();
  return db.getAllAsync<SalePayment>(
    `SELECT sp.*, a.name as account_name FROM sale_payments sp
     JOIN accounts a ON a.id = sp.account_id
     WHERE sp.sale_id = ?`,
    [saleId]
  );
}

export async function createSale(params: {
  party_name: string;
  party_phone?: string;
  date: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
  discount_amount?: number;
  service_charges?: number;
  notes?: string;
  invoice_no?: string;
}): Promise<number> {
  validateSaleItems(params.items);

  const db = await getDatabase();

  let subtotal = 0;
  const itemDetails: {
    product_id: number;
    qty: number;
    unit_price: number;
    unit_cost: number;
    total: number;
  }[] = [];

  for (const item of params.items) {
    const total = mulMoney(item.qty, item.unit_price);
    subtotal = addMoney(subtotal, total);
    itemDetails.push({
      product_id: item.product_id,
      qty: item.qty,
      unit_price: item.unit_price,
      unit_cost: 0,
      total,
    });
  }

  const discount = roundMoney(Math.max(0, params.discount_amount ?? 0));
  const serviceCharges = roundMoney(Math.max(0, params.service_charges ?? 0));
  if (discount > subtotal + 0.01) {
    throw new Error('Discount cannot exceed subtotal');
  }
  const totalAmount = roundMoney(
    Math.max(0, addMoney(subMoney(subtotal, discount), serviceCharges))
  );

  let paidAmount = 0;
  for (const payment of params.payments) {
    if (payment.amount <= 0) continue;
    paidAmount = addMoney(paidAmount, payment.amount);
  }
  if (paidAmount > totalAmount + 0.01) {
    throw new Error('Total payments cannot exceed invoice amount');
  }

  const status = getPaymentStatus(totalAmount, paidAmount);
  let saleId = 0;

  await db.withTransactionAsync(async () => {
    const invoiceNo = await resolveSaleInvoiceNo(params.invoice_no);
    const partyId = await upsertParty(params.party_name, 'customer', db, params.party_phone);

    const result = await db.runAsync(
      `INSERT INTO sales (invoice_no, party_id, party_name, date, subtotal, discount_amount, service_charges, total_amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        partyId,
        params.party_name,
        params.date,
        subtotal,
        discount,
        serviceCharges,
        totalAmount,
        paidAmount,
        status,
        params.notes ?? null,
      ]
    );
    saleId = result.lastInsertRowId;

    for (let i = 0; i < itemDetails.length; i++) {
      itemDetails[i].unit_cost = await reduceInventory(
        db,
        itemDetails[i].product_id,
        itemDetails[i].qty
      );
    }

    for (const item of itemDetails) {
      await db.runAsync(
        `INSERT INTO sale_items (sale_id, product_id, qty, unit_price, unit_cost, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, item.qty, item.unit_price, item.unit_cost, item.total]
      );
      await db.runAsync(
        `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
         VALUES (?, 'sale', ?, ?, 'sale', ?, ?)`,
        [item.product_id, -item.qty, item.unit_cost, saleId, `Sale ${invoiceNo}`]
      );
    }

    for (const payment of params.payments) {
      if (payment.amount <= 0) continue;
      await assertActivePaymentAccount(db, payment.account_id);
      const paymentResult = await db.runAsync(
        `INSERT INTO sale_payments (sale_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
        [saleId, payment.account_id, roundMoney(payment.amount), payment.date, payment.notes ?? null]
      );
      await recordTransaction(db, {
        account_id: payment.account_id,
        type: 'sale_payment',
        amount: roundMoney(payment.amount),
        reference_type: 'sale',
        reference_id: saleId,
        payment_id: paymentResult.lastInsertRowId,
        description: `Payment for ${invoiceNo} - ${params.party_name}`,
        date: payment.date,
      });
    }

    const sumRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ?`,
      [saleId]
    );
    const actualPaid = roundMoney(sumRow?.total ?? 0);
    const actualStatus = getPaymentStatus(totalAmount, actualPaid);
    await db.runAsync('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?', [
      actualPaid,
      actualStatus,
      saleId,
    ]);
  });

  try {
    await repairFinancialDataIntegrity(undefined, { force: true });
  } catch {
    // Sale is saved; repair is best-effort housekeeping.
  }

  try {
    const sale = await getSaleById(saleId);
    if (sale) {
      await syncNextInvoiceSettingAfterUse('sale', sale.invoice_no);
    }
  } catch {
    // Counter sync failure must not fail an already-created sale.
  }

  return saleId;
}

export async function updateSale(
  saleId: number,
  params: {
    party_name: string;
    date: string;
    invoice_no?: string;
    discount_amount: number;
    service_charges?: number;
    notes?: string;
  }
): Promise<void> {
  const db = await getDatabase();
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error('Sale not found');

  const invoiceNo = params.invoice_no?.trim() || sale.invoice_no;
  if (!invoiceNo) throw new Error('Invoice number is required');

  const discount = roundMoney(Math.max(0, params.discount_amount));
  if (discount > sale.subtotal + 0.01) {
    throw new Error('Discount cannot exceed subtotal');
  }
  const serviceCharges = roundMoney(Math.max(0, params.service_charges ?? sale.service_charges ?? 0));
  const totalAmount = roundMoney(
    Math.max(0, addMoney(subMoney(sale.subtotal, discount), serviceCharges))
  );
  if (totalAmount + 0.01 < sale.paid_amount) {
    throw new Error('Discount cannot be greater than amount due after payments');
  }

  const status = getPaymentStatus(totalAmount, sale.paid_amount);
  const partyName = params.party_name.trim();
  const invoiceChanged = invoiceNo !== sale.invoice_no;

  await db.withTransactionAsync(async () => {
    const partyId = await upsertParty(partyName, 'customer', db);
    await db.runAsync(
      `UPDATE sales SET invoice_no = ?, party_id = ?, party_name = ?, date = ?, discount_amount = ?, service_charges = ?, total_amount = ?, status = ?, notes = ? WHERE id = ?`,
      [
        invoiceNo,
        partyId,
        partyName,
        params.date,
        discount,
        serviceCharges,
        totalAmount,
        status,
        params.notes ?? null,
        saleId,
      ]
    );
    await db.runAsync(
      `UPDATE transactions SET description = ? WHERE reference_type = 'sale' AND reference_id = ? AND type = 'sale_payment'`,
      [`Payment for ${invoiceNo} - ${partyName}`, saleId]
    );
    if (invoiceChanged) {
      await db.runAsync(
        `UPDATE inventory_movements SET notes = ? WHERE reference_type = 'sale' AND reference_id = ?`,
        [`Sale ${invoiceNo}`, saleId]
      );
    }
  });

  if (invoiceChanged) {
    try {
      await syncNextInvoiceSettingAfterUse('sale', invoiceNo);
    } catch {
      // Counter sync failure must not fail an already-updated sale.
    }
  }
}

export async function addSalePayment(
  saleId: number,
  payment: PaymentInput
): Promise<void> {
  const db = await getDatabase();
  if (!payment.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }

  await db.withTransactionAsync(async () => {
    const sale = await db.getFirstAsync<Sale>('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (!sale) throw new Error('Sale not found');

    validatePaymentAmount(sale.total_amount, sale.paid_amount, payment.amount);
    await assertActivePaymentAccount(db, payment.account_id);

    const amount = roundMoney(payment.amount);
    const paymentResult = await db.runAsync(
      `INSERT INTO sale_payments (sale_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
      [saleId, payment.account_id, amount, payment.date, payment.notes ?? null]
    );
    await recordTransaction(db, {
      account_id: payment.account_id,
      type: 'sale_payment',
      amount,
      reference_type: 'sale',
      reference_id: saleId,
      payment_id: paymentResult.lastInsertRowId,
      description: `Payment for ${sale.invoice_no} - ${sale.party_name}`,
      date: payment.date,
    });

    const sumRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ?`,
      [saleId]
    );
    const newPaid = roundMoney(sumRow?.total ?? 0);
    const status = getPaymentStatus(sale.total_amount, newPaid);
    await db.runAsync('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?', [
      newPaid,
      status,
      saleId,
    ]);
  });
}

export async function deleteSale(id: number): Promise<void> {
  const db = await getDatabase();
  const sale = await getSaleById(id);
  if (!sale) throw new Error('Sale not found');

  const items = await getSaleItems(id);
  const productIds = Array.from(new Set(items.map((i) => i.product_id)));

  await db.withTransactionAsync(async () => {
    // Remove this sale's own movements, then recompute affected products from
    // their remaining history — mirrors deletePurchase and keeps the movement
    // log free of rows referencing a deleted invoice.
    await db.runAsync(
      `DELETE FROM inventory_movements WHERE reference_type = 'sale' AND reference_id = ?`,
      [id]
    );
    for (const productId of productIds) {
      await recomputeProductStock(db, productId);
    }

    await reverseTransactionsByReference(db, 'sale', id);
    await db.runAsync('DELETE FROM sale_payments WHERE sale_id = ?', [id]);
    await db.runAsync('DELETE FROM sale_items WHERE sale_id = ?', [id]);
    await db.runAsync('DELETE FROM sales WHERE id = ?', [id]);
  });

  try {
    await repairFinancialDataIntegrity(undefined, { force: true });
  } catch {
    // The sale was deleted; integrity repair is best-effort housekeeping.
  }
}

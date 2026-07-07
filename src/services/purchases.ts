import {
  getDatabase,
  getPaymentStatus,
  recomputeProductStock,
  recordTransaction,
  repairFinancialDataIntegrity,
  reverseTransactionsByReference,
  updateWeightedAvgCost,
} from '../db/database';
import { resolvePurchaseInvoiceNo, syncNextInvoiceSettingAfterUse } from './invoiceNumbers';
import { upsertParty } from './parties';
import { formatCurrency } from '../utils/format';
import { addMoney, mulMoney, roundMoney, subMoney } from '../utils/money';
import type {
  PaymentInput,
  Purchase,
  PurchaseItem,
  PurchaseItemInput,
  PurchasePayment,
} from '../types';

function validatePurchaseItems(items: PurchaseItemInput[]): void {
  if (items.length === 0) throw new Error('Add at least one item');
  for (const item of items) {
    if (item.qty <= 0) throw new Error('Item quantity must be greater than zero');
    if (item.unit_cost <= 0) throw new Error('Item unit cost must be greater than zero');
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

function roundUnitCost(value: number): number {
  return Math.round(value * 10000) / 10000;
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
    throw new Error('Cannot use an excluded account for purchase payments');
  }
}

export async function getPurchases(
  filter?: 'all' | 'paid' | 'unpaid',
  options?: { limit?: number; offset?: number }
): Promise<Purchase[]> {
  const db = await getDatabase();
  const page = options?.limit ? ' LIMIT ? OFFSET ?' : '';
  const params = options?.limit ? [options.limit, options.offset ?? 0] : [];
  if (filter === 'paid') {
    return db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE status = 'paid' ORDER BY date DESC, id DESC${page}`,
      params
    );
  }
  if (filter === 'unpaid') {
    return db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE status IN ('unpaid', 'partial') ORDER BY date DESC, id DESC${page}`,
      params
    );
  }
  return db.getAllAsync<Purchase>(`SELECT * FROM purchases ORDER BY date DESC, id DESC${page}`, params);
}

export async function getPurchaseById(id: number): Promise<Purchase | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Purchase>('SELECT * FROM purchases WHERE id = ?', [id]);
}

export async function getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<PurchaseItem>(
    `SELECT pi.*, p.name as product_name FROM purchase_items pi
     JOIN products p ON p.id = pi.product_id
     WHERE pi.purchase_id = ?`,
    [purchaseId]
  );
}

export async function getPurchasePayments(purchaseId: number): Promise<PurchasePayment[]> {
  const db = await getDatabase();
  return db.getAllAsync<PurchasePayment>(
    `SELECT pp.*, a.name as account_name FROM purchase_payments pp
     JOIN accounts a ON a.id = pp.account_id
     WHERE pp.purchase_id = ?`,
    [purchaseId]
  );
}

export async function createPurchase(params: {
  supplier_name: string;
  date: string;
  items: PurchaseItemInput[];
  payments: PaymentInput[];
  discount_amount?: number;
  notes?: string;
  vendor_invoice_no?: string;
  invoice_no?: string;
}): Promise<number> {
  validatePurchaseItems(params.items);

  const db = await getDatabase();

  let subtotal = 0;
  const itemDetails: { product_id: number; qty: number; unit_cost: number; total: number }[] = [];

  for (const item of params.items) {
    const total = mulMoney(item.qty, item.unit_cost);
    subtotal = addMoney(subtotal, total);
    itemDetails.push({
      product_id: item.product_id,
      qty: item.qty,
      unit_cost: item.unit_cost,
      total,
    });
  }

  const discount = roundMoney(Math.max(0, params.discount_amount ?? 0));
  if (discount > subtotal + 0.01) {
    throw new Error('Discount cannot exceed subtotal');
  }
  const totalAmount = roundMoney(Math.max(0, subMoney(subtotal, discount)));

  // Spread invoice discount into lines and force line totals to add back to
  // the invoice total, avoiding header/payable vs inventory valuation drift.
  let allocatedTotal = 0;
  for (let i = 0; i < itemDetails.length; i++) {
    const item = itemDetails[i];
    const discountedTotal =
      i === itemDetails.length - 1
        ? subMoney(totalAmount, allocatedTotal)
        : roundMoney((item.total / subtotal) * totalAmount);
    allocatedTotal = addMoney(allocatedTotal, discountedTotal);
    item.total = discountedTotal;
    item.unit_cost = roundUnitCost(discountedTotal / item.qty);
  }

  let paidAmount = 0;
  for (const payment of params.payments) {
    if (payment.amount <= 0) continue;
    paidAmount = addMoney(paidAmount, payment.amount);
  }
  if (paidAmount > totalAmount + 0.01) {
    throw new Error('Total payments cannot exceed invoice amount');
  }

  const status = getPaymentStatus(totalAmount, paidAmount);
  let purchaseId = 0;

  await db.withTransactionAsync(async () => {
    const invoiceNo = await resolvePurchaseInvoiceNo(params.invoice_no);
    const partyId = await upsertParty(params.supplier_name, 'vendor', db);

    const result = await db.runAsync(
      `INSERT INTO purchases (invoice_no, party_id, supplier_name, vendor_invoice_no, date, subtotal, discount_amount, total_amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        partyId,
        params.supplier_name,
        params.vendor_invoice_no?.trim() || null,
        params.date,
        subtotal,
        discount,
        totalAmount,
        paidAmount,
        status,
        params.notes ?? null,
      ]
    );
    purchaseId = result.lastInsertRowId;

    for (const item of itemDetails) {
      await db.runAsync(
        `INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, total)
         VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, item.product_id, item.qty, item.unit_cost, item.total]
      );
      await updateWeightedAvgCost(db, item.product_id, item.qty, item.unit_cost);
      await db.runAsync(
        `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
         VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)`,
        [item.product_id, item.qty, item.unit_cost, purchaseId, `Purchase ${invoiceNo}`]
      );
    }

    for (const payment of params.payments) {
      if (payment.amount <= 0) continue;
      await assertActivePaymentAccount(db, payment.account_id);
      const amount = roundMoney(payment.amount);
      const paymentResult = await db.runAsync(
        `INSERT INTO purchase_payments (purchase_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, payment.account_id, amount, payment.date, payment.notes ?? null]
      );
      await recordTransaction(db, {
        account_id: payment.account_id,
        type: 'purchase_payment',
        amount: -amount,
        reference_type: 'purchase',
        reference_id: purchaseId,
        payment_id: paymentResult.lastInsertRowId,
        description: `Payment for ${invoiceNo} - ${params.supplier_name}`,
        date: payment.date,
      });
    }

    const sumRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_payments WHERE purchase_id = ?`,
      [purchaseId]
    );
    const actualPaid = roundMoney(sumRow?.total ?? 0);
    const actualStatus = getPaymentStatus(totalAmount, actualPaid);
    await db.runAsync('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?', [
      actualPaid,
      actualStatus,
      purchaseId,
    ]);
  });

  try {
    await repairFinancialDataIntegrity(undefined, { force: true });
  } catch {
    // Purchase is saved; repair is best-effort housekeeping.
  }

  try {
    const purchase = await getPurchaseById(purchaseId);
    if (purchase) {
      await syncNextInvoiceSettingAfterUse('purchase', purchase.invoice_no);
    }
  } catch {
    // Counter sync failure must not fail an already-created purchase.
  }

  return purchaseId;
}

export async function updatePurchase(
  purchaseId: number,
  params: {
    supplier_name: string;
    date: string;
    invoice_no?: string;
    vendor_invoice_no?: string;
    discount_amount: number;
    notes?: string;
  }
): Promise<void> {
  const db = await getDatabase();
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) throw new Error('Purchase not found');

  const invoiceNo = params.invoice_no?.trim() || purchase.invoice_no;
  if (!invoiceNo) throw new Error('Purchase number is required');

  const discount = roundMoney(Math.max(0, params.discount_amount));
  if (discount > purchase.subtotal + 0.01) {
    throw new Error('Discount cannot exceed subtotal');
  }
  // The purchase discount is baked into each line's inventory cost (weighted avg,
  // COGS, stock valuation) when the purchase is created. Changing it here would
  // desync those values, so require a delete-and-recreate instead.
  if (Math.abs(discount - roundMoney(purchase.discount_amount ?? 0)) > 0.01) {
    throw new Error(
      'The discount is built into inventory costs and cannot be changed here. Delete this purchase and re-enter it to change the discount.'
    );
  }
  const totalAmount = roundMoney(Math.max(0, subMoney(purchase.subtotal, discount)));
  if (totalAmount + 0.01 < purchase.paid_amount) {
    throw new Error('Discount cannot be greater than amount due after payments');
  }

  const status = getPaymentStatus(totalAmount, purchase.paid_amount);
  const supplierName = params.supplier_name.trim();
  const vendorInvoiceNo = params.vendor_invoice_no?.trim() || null;
  const invoiceChanged = invoiceNo !== purchase.invoice_no;

  await db.withTransactionAsync(async () => {
    const partyId = await upsertParty(supplierName, 'vendor', db);
    await db.runAsync(
      `UPDATE purchases SET invoice_no = ?, party_id = ?, supplier_name = ?, vendor_invoice_no = ?, date = ?, discount_amount = ?, total_amount = ?, status = ?, notes = ? WHERE id = ?`,
      [
        invoiceNo,
        partyId,
        supplierName,
        vendorInvoiceNo,
        params.date,
        discount,
        totalAmount,
        status,
        params.notes ?? null,
        purchaseId,
      ]
    );
    await db.runAsync(
      `UPDATE transactions SET description = ? WHERE reference_type = 'purchase' AND reference_id = ? AND type = 'purchase_payment'`,
      [`Payment for ${invoiceNo} - ${supplierName}`, purchaseId]
    );
    if (invoiceChanged) {
      await db.runAsync(
        `UPDATE inventory_movements SET notes = ? WHERE reference_type = 'purchase' AND reference_id = ?`,
        [`Purchase ${invoiceNo}`, purchaseId]
      );
    }
  });

  if (invoiceChanged) {
    try {
      await syncNextInvoiceSettingAfterUse('purchase', invoiceNo);
    } catch {
      // Counter sync failure must not fail an already-updated purchase.
    }
  }
}

export async function addPurchasePayment(
  purchaseId: number,
  payment: PaymentInput
): Promise<void> {
  const db = await getDatabase();
  if (!payment.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }

  await db.withTransactionAsync(async () => {
    const purchase = await db.getFirstAsync<Purchase>(
      'SELECT * FROM purchases WHERE id = ?',
      [purchaseId]
    );
    if (!purchase) throw new Error('Purchase not found');

    validatePaymentAmount(purchase.total_amount, purchase.paid_amount, payment.amount);
    await assertActivePaymentAccount(db, payment.account_id);

    const amount = roundMoney(payment.amount);
    const paymentResult = await db.runAsync(
      `INSERT INTO purchase_payments (purchase_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
      [purchaseId, payment.account_id, amount, payment.date, payment.notes ?? null]
    );
    await recordTransaction(db, {
      account_id: payment.account_id,
      type: 'purchase_payment',
      amount: -amount,
      reference_type: 'purchase',
      reference_id: purchaseId,
      payment_id: paymentResult.lastInsertRowId,
      description: `Payment for ${purchase.invoice_no} - ${purchase.supplier_name}`,
      date: payment.date,
    });

    const sumRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_payments WHERE purchase_id = ?`,
      [purchaseId]
    );
    const newPaid = roundMoney(sumRow?.total ?? 0);
    const status = getPaymentStatus(purchase.total_amount, newPaid);
    await db.runAsync('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?', [
      newPaid,
      status,
      purchaseId,
    ]);
  });
}

export async function deletePurchase(id: number): Promise<void> {
  const db = await getDatabase();
  const purchase = await getPurchaseById(id);
  if (!purchase) throw new Error('Purchase not found');

  const items = await getPurchaseItems(id);
  const productIds = Array.from(new Set(items.map((i) => i.product_id)));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id = ?`,
      [id]
    );

    for (const productId of productIds) {
      const { currentQty } = await recomputeProductStock(db, productId);
      if (currentQty < -0.0001) {
        const product = await db.getFirstAsync<{ name: string }>(
          'SELECT name FROM products WHERE id = ?',
          [productId]
        );
        throw new Error(
          `Cannot delete: stock for ${product?.name ?? 'an item'} would go negative (already sold)`
        );
      }
    }

    await reverseTransactionsByReference(db, 'purchase', id);
    await db.runAsync('DELETE FROM purchase_payments WHERE purchase_id = ?', [id]);
    await db.runAsync('DELETE FROM purchase_items WHERE purchase_id = ?', [id]);
    await db.runAsync('DELETE FROM purchases WHERE id = ?', [id]);
  });

  try {
    await repairFinancialDataIntegrity(undefined, { force: true });
  } catch {
    // The purchase was deleted; integrity repair is best-effort housekeeping.
  }
}

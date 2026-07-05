import {
  generateInvoiceNo,
  getDatabase,
  getPaymentStatus,
  recordTransaction,
  reduceInventory,
} from '../db/database';
import { triggerAutoBackup } from './backup';
import { upsertParty } from './parties';
import type { PaymentInput, Sale, SaleItem, SaleItemInput, SalePayment } from '../types';

export async function getSales(filter?: 'all' | 'paid' | 'unpaid'): Promise<Sale[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM sales ORDER BY date DESC, id DESC';
  const params: string[] = [];

  if (filter === 'paid') {
    query = `SELECT * FROM sales WHERE status = 'paid' ORDER BY date DESC, id DESC`;
  } else if (filter === 'unpaid') {
    query = `SELECT * FROM sales WHERE status IN ('unpaid', 'partial') ORDER BY date DESC, id DESC`;
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
  date: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
  discount_amount?: number;
  notes?: string;
}): Promise<number> {
  const db = await getDatabase();
  const invoiceNo = await generateInvoiceNo(db, 'S');

  let subtotal = 0;
  const itemDetails: { product_id: number; qty: number; unit_price: number; unit_cost: number; total: number }[] = [];

  for (const item of params.items) {
    const total = item.qty * item.unit_price;
    subtotal += total;
    itemDetails.push({
      product_id: item.product_id,
      qty: item.qty,
      unit_price: item.unit_price,
      unit_cost: 0,
      total,
    });
  }

  const discount = Math.max(0, params.discount_amount ?? 0);
  const totalAmount = Math.max(0, subtotal - discount);

  let paidAmount = 0;
  for (const payment of params.payments) {
    paidAmount += payment.amount;
  }

  const status = getPaymentStatus(totalAmount, paidAmount);
  let saleId = 0;

  await db.withTransactionAsync(async () => {
    await upsertParty(params.party_name, 'customer', db);

    for (let i = 0; i < itemDetails.length; i++) {
      itemDetails[i].unit_cost = await reduceInventory(
        db,
        itemDetails[i].product_id,
        itemDetails[i].qty
      );
    }

    const result = await db.runAsync(
      `INSERT INTO sales (invoice_no, party_name, date, subtotal, discount_amount, total_amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        params.party_name,
        params.date,
        subtotal,
        discount,
        totalAmount,
        paidAmount,
        status,
        params.notes ?? null,
      ]
    );
    saleId = result.lastInsertRowId;

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
      await db.runAsync(
        `INSERT INTO sale_payments (sale_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
        [saleId, payment.account_id, payment.amount, payment.date, payment.notes ?? null]
      );
      await recordTransaction(db, {
        account_id: payment.account_id,
        type: 'sale_payment',
        amount: payment.amount,
        reference_type: 'sale',
        reference_id: saleId,
        description: `Payment for ${invoiceNo} - ${params.party_name}`,
        date: payment.date,
      });
    }
  });

  await triggerAutoBackup();
  return saleId;
}

export async function updateSale(
  saleId: number,
  params: {
    party_name: string;
    date: string;
    discount_amount: number;
    notes?: string;
  }
): Promise<void> {
  const db = await getDatabase();
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error('Sale not found');

  const discount = Math.max(0, params.discount_amount);
  const totalAmount = Math.max(0, sale.subtotal - discount);
  if (totalAmount + 0.01 < sale.paid_amount) {
    throw new Error('Discount cannot be greater than amount due after payments');
  }

  const status = getPaymentStatus(totalAmount, sale.paid_amount);

  await db.runAsync(
    `UPDATE sales SET party_name = ?, date = ?, discount_amount = ?, total_amount = ?, status = ?, notes = ? WHERE id = ?`,
    [
      params.party_name.trim(),
      params.date,
      discount,
      totalAmount,
      status,
      params.notes ?? null,
      saleId,
    ]
  );
  await upsertParty(params.party_name, 'customer');
  await triggerAutoBackup();
}

export async function addSalePayment(
  saleId: number,
  payment: PaymentInput
): Promise<void> {
  const db = await getDatabase();
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error('Sale not found');
  if (!payment.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sale_payments (sale_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
      [saleId, payment.account_id, payment.amount, payment.date, payment.notes ?? null]
    );
    await recordTransaction(db, {
      account_id: payment.account_id,
      type: 'sale_payment',
      amount: payment.amount,
      reference_type: 'sale',
      reference_id: saleId,
      description: `Payment for ${sale.invoice_no} - ${sale.party_name}`,
      date: payment.date,
    });

    const newPaid = sale.paid_amount + payment.amount;
    const status = getPaymentStatus(sale.total_amount, newPaid);
    await db.runAsync('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?', [
      newPaid,
      status,
      saleId,
    ]);
  });

  await triggerAutoBackup();
}

export async function deleteSale(id: number): Promise<void> {
  const db = await getDatabase();
  const sale = await getSaleById(id);
  if (!sale) throw new Error('Sale not found');

  const items = await getSaleItems(id);
  const payments = await getSalePayments(id);

  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync('UPDATE products SET current_qty = current_qty + ? WHERE id = ?', [
        item.qty,
        item.product_id,
      ]);
      await db.runAsync(
        `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
         VALUES (?, 'adjustment', ?, ?, 'sale_delete', ?, ?)`,
        [item.product_id, item.qty, item.unit_cost, id, `Reversed ${sale.invoice_no}`]
      );
    }

    for (const payment of payments) {
      await db.runAsync('UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?', [
        payment.amount,
        payment.account_id,
      ]);
    }

    await db.runAsync(`DELETE FROM transactions WHERE reference_type = 'sale' AND reference_id = ?`, [
      id,
    ]);
    await db.runAsync('DELETE FROM sales WHERE id = ?', [id]);
  });

  await triggerAutoBackup();
}

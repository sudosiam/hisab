import {
  generateInvoiceNo,
  getDatabase,
  getPaymentStatus,
  recordTransaction,
  updateWeightedAvgCost,
} from '../db/database';
import { triggerAutoBackup } from './backup';
import { upsertParty } from './parties';
import type {
  PaymentInput,
  Purchase,
  PurchaseItem,
  PurchaseItemInput,
  PurchasePayment,
} from '../types';

export async function getPurchases(filter?: 'all' | 'paid' | 'unpaid'): Promise<Purchase[]> {
  const db = await getDatabase();
  if (filter === 'paid') {
    return db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE status = 'paid' ORDER BY date DESC, id DESC`
    );
  }
  if (filter === 'unpaid') {
    return db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE status IN ('unpaid', 'partial') ORDER BY date DESC, id DESC`
    );
  }
  return db.getAllAsync<Purchase>('SELECT * FROM purchases ORDER BY date DESC, id DESC');
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
}): Promise<number> {
  const db = await getDatabase();
  const invoiceNo = await generateInvoiceNo(db, 'P');

  let subtotal = 0;
  const itemDetails: { product_id: number; qty: number; unit_cost: number; total: number }[] = [];

  for (const item of params.items) {
    const total = item.qty * item.unit_cost;
    subtotal += total;
    itemDetails.push({
      product_id: item.product_id,
      qty: item.qty,
      unit_cost: item.unit_cost,
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
  let purchaseId = 0;

  await db.withTransactionAsync(async () => {
    await upsertParty(params.supplier_name, 'vendor', db);

    const result = await db.runAsync(
      `INSERT INTO purchases (invoice_no, supplier_name, date, total_amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        params.supplier_name,
        params.date,
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
      await db.runAsync(
        `INSERT INTO purchase_payments (purchase_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, payment.account_id, payment.amount, payment.date, payment.notes ?? null]
      );
      await recordTransaction(db, {
        account_id: payment.account_id,
        type: 'purchase_payment',
        amount: -payment.amount,
        reference_type: 'purchase',
        reference_id: purchaseId,
        description: `Payment for ${invoiceNo} - ${params.supplier_name}`,
        date: payment.date,
      });
    }
  });

  await triggerAutoBackup();
  return purchaseId;
}

export async function addPurchasePayment(
  purchaseId: number,
  payment: PaymentInput
): Promise<void> {
  const db = await getDatabase();
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) throw new Error('Purchase not found');
  if (!payment.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO purchase_payments (purchase_id, account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)`,
      [purchaseId, payment.account_id, payment.amount, payment.date, payment.notes ?? null]
    );
    await recordTransaction(db, {
      account_id: payment.account_id,
      type: 'purchase_payment',
      amount: -payment.amount,
      reference_type: 'purchase',
      reference_id: purchaseId,
      description: `Payment for ${purchase.invoice_no} - ${purchase.supplier_name}`,
      date: payment.date,
    });

    const newPaid = purchase.paid_amount + payment.amount;
    const status = getPaymentStatus(purchase.total_amount, newPaid);
    await db.runAsync('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?', [
      newPaid,
      status,
      purchaseId,
    ]);
  });

  await triggerAutoBackup();
}

export async function deletePurchase(id: number): Promise<void> {
  const db = await getDatabase();
  const purchase = await getPurchaseById(id);
  if (!purchase) throw new Error('Purchase not found');

  const items = await getPurchaseItems(id);
  const payments = await getPurchasePayments(id);

  await db.withTransactionAsync(async () => {
    for (const item of items) {
      const product = await db.getFirstAsync<{ current_qty: number; name: string }>(
        'SELECT current_qty, name FROM products WHERE id = ?',
        [item.product_id]
      );
      if (!product || product.current_qty < item.qty) {
        throw new Error(`Cannot delete: not enough stock to reverse ${product?.name ?? 'item'}`);
      }
      await db.runAsync('UPDATE products SET current_qty = current_qty - ? WHERE id = ?', [
        item.qty,
        item.product_id,
      ]);
      await db.runAsync(
        `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
         VALUES (?, 'adjustment', ?, ?, 'purchase_delete', ?, ?)`,
        [item.product_id, -item.qty, item.unit_cost, id, `Reversed ${purchase.invoice_no}`]
      );
    }

    for (const payment of payments) {
      await db.runAsync('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?', [
        payment.amount,
        payment.account_id,
      ]);
    }

    await db.runAsync(
      `DELETE FROM transactions WHERE reference_type = 'purchase' AND reference_id = ?`,
      [id]
    );
    await db.runAsync('DELETE FROM purchases WHERE id = ?', [id]);
  });

  await triggerAutoBackup();
}

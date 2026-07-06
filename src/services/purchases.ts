import {
  getDatabase,
  getPaymentStatus,
  recomputeProductStock,
  recordTransaction,
  repairFinancialDataIntegrity,
  reverseTransactionsByReference,
  updateWeightedAvgCost,
} from '../db/database';
import { isInvoiceNoCollision, resolvePurchaseInvoiceNo } from './invoiceNumbers';
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

  // Spread invoice discount into each line's inventory cost (what you actually paid).
  const costFactor = subtotal > 0 ? roundMoney(subMoney(subtotal, discount) / subtotal) : 1;
  for (const item of itemDetails) {
    item.unit_cost = roundMoney(item.unit_cost * costFactor);
    item.total = mulMoney(item.qty, item.unit_cost);
  }

  let paidAmount = 0;
  for (const payment of params.payments) {
    paidAmount = addMoney(paidAmount, payment.amount);
  }
  if (paidAmount > totalAmount + 0.01) {
    throw new Error('Total payments cannot exceed invoice amount');
  }

  const status = getPaymentStatus(totalAmount, paidAmount);
  let purchaseId = 0;

  const attemptCreate = async (): Promise<void> => {
    await db.withTransactionAsync(async () => {
      const invoiceNo = await resolvePurchaseInvoiceNo(params.invoice_no);
      await upsertParty(params.supplier_name, 'vendor', db);

      const result = await db.runAsync(
        `INSERT INTO purchases (invoice_no, supplier_name, vendor_invoice_no, date, subtotal, discount_amount, total_amount, paid_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNo,
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
    });
  };

  try {
    await attemptCreate();
  } catch (error) {
    if (!params.invoice_no?.trim() && isInvoiceNoCollision(error)) {
      await attemptCreate();
    } else {
      throw error;
    }
  }

  await repairFinancialDataIntegrity();
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

  validatePaymentAmount(purchase.total_amount, purchase.paid_amount, payment.amount);

  await db.withTransactionAsync(async () => {
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

    const newPaid = addMoney(purchase.paid_amount, amount);
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

  await repairFinancialDataIntegrity();
}

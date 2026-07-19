import {
  getDatabase,
  getPaymentStatus,
  recomputeProductStock,
  recordTransaction,
  reverseTransactionsByReference,
  updateAccountBalance,
  updateWeightedAvgCost,
} from '../db/database';
import { resolvePurchaseInvoiceNo, syncNextInvoiceSettingAfterUse } from './invoiceNumbers';
import { upsertParty } from './parties';
import { assertGstPlaceOfSupply, computeGstDocument } from './gst';
import { getBusinessState, isGstEnabled, isTaxInclusivePricing } from './appSettings';
import { formatCurrency } from '../utils/format';
import { addMoney, roundMoney, subMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import { pickLegacyPaymentMatch } from '../utils/paymentPair';
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

async function resolveVendorState(
  db: Awaited<ReturnType<typeof getDatabase>>,
  supplierName: string,
  partyId?: number | null
): Promise<string | null> {
  if (partyId) {
    const row = await db.getFirstAsync<{ state: string | null; gstin: string | null }>(
      'SELECT state, gstin FROM parties WHERE id = ?',
      [partyId]
    );
    if (row?.state) return row.state;
    if (row?.gstin) {
      const { stateCodeFromGstin } = await import('./gst');
      return stateCodeFromGstin(row.gstin);
    }
  }
  const byName = await db.getFirstAsync<{ state: string | null; gstin: string | null }>(
    `SELECT state, gstin FROM parties WHERE name = ? COLLATE NOCASE AND type = 'vendor' LIMIT 1`,
    [supplierName.trim()]
  );
  if (byName?.state) return byName.state;
  if (byName?.gstin) {
    const { stateCodeFromGstin } = await import('./gst');
    return stateCodeFromGstin(byName.gstin);
  }
  return null;
}

async function buildPurchaseGst(
  db: Awaited<ReturnType<typeof getDatabase>>,
  params: {
    supplier_name: string;
    party_id?: number | null;
    items: PurchaseItemInput[];
    discount_amount?: number;
    /** When set, overrides Settings tax-inclusive flag (needed for stock-safe rebuilds). */
    tax_inclusive?: boolean;
  }
) {
  const gstEnabled = await isGstEnabled();
  const businessState = await getBusinessState();
  const taxInclusive =
    params.tax_inclusive !== undefined
      ? params.tax_inclusive
      : await isTaxInclusivePricing();
  const partyState = await resolveVendorState(db, params.supplier_name, params.party_id);
  return computeGstDocument({
    lines: params.items.map((item) => ({
      qty: item.qty,
      unit_price: item.unit_cost,
      gst_rate: item.gst_rate,
      hsn_sac: item.hsn_sac,
    })),
    discount_amount: params.discount_amount,
    service_charges: 0,
    business_state: businessState,
    party_state: partyState,
    gst_enabled: gstEnabled,
    tax_inclusive: taxInclusive,
  });
}

async function buildPurchaseGstChecked(
  db: Awaited<ReturnType<typeof getDatabase>>,
  params: {
    supplier_name: string;
    party_id?: number | null;
    items: PurchaseItemInput[];
    discount_amount?: number;
    tax_inclusive?: boolean;
  }
) {
  const gst = await buildPurchaseGst(db, params);
  const businessState = await getBusinessState();
  const partyState = await resolveVendorState(db, params.supplier_name, params.party_id);
  const gstEnabled = await isGstEnabled();
  assertGstPlaceOfSupply({
    gst_enabled: gstEnabled,
    tax_amount: gst.tax_amount,
    business_state: businessState,
    party_state: partyState,
  });
  return gst;
}

export async function getPurchases(
  filter?: 'all' | 'paid' | 'unpaid',
  options?: { limit?: number; offset?: number; periodKey?: string }
): Promise<Purchase[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options?.periodKey) {
    const { start, end } = await resolvePeriodRange(options.periodKey);
    conditions.push('date >= ? AND date <= ?');
    params.push(start, end);
  }

  if (filter === 'paid') {
    conditions.push("status = 'paid'");
  } else if (filter === 'unpaid') {
    conditions.push("status IN ('unpaid', 'partial')");
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = options?.limit ? ' LIMIT ? OFFSET ?' : '';
  if (options?.limit) {
    params.push(options.limit, options.offset ?? 0);
  }

  return db.getAllAsync<Purchase>(
    `SELECT * FROM purchases ${where} ORDER BY date DESC, id DESC${page}`,
    params
  );
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
  const gst = await buildPurchaseGstChecked(db, params);
  const subtotal = gst.subtotal;
  const discount = gst.discount_amount;
  const totalAmount = gst.total_amount;

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
      `INSERT INTO purchases (
         invoice_no, party_id, supplier_name, vendor_invoice_no, date, subtotal, discount_amount,
         taxable_amount, cgst_amount, sgst_amount, igst_amount, is_inter_state, place_of_supply,
         total_amount, paid_amount, status, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        partyId,
        params.supplier_name,
        params.vendor_invoice_no?.trim() || null,
        params.date,
        subtotal,
        discount,
        gst.taxable_amount,
        gst.cgst_amount,
        gst.sgst_amount,
        gst.igst_amount,
        gst.is_inter_state ? 1 : 0,
        gst.place_of_supply,
        totalAmount,
        paidAmount,
        status,
        params.notes ?? null,
      ]
    );
    purchaseId = result.lastInsertRowId;

    for (let i = 0; i < params.items.length; i++) {
      const item = params.items[i];
      const line = gst.lines[i];
      // Inventory valued at taxable (ex-GST) amount after discount.
      const invTotal = line.taxable_amount;
      const invUnitCost = roundUnitCost(invTotal / item.qty);
      await db.runAsync(
        `INSERT INTO purchase_items (
           purchase_id, product_id, qty, unit_cost, total,
           hsn_sac, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          item.product_id,
          item.qty,
          invUnitCost,
          invTotal,
          line.hsn_sac,
          line.gst_rate,
          line.taxable_amount,
          line.cgst_amount,
          line.sgst_amount,
          line.igst_amount,
        ]
      );
      await updateWeightedAvgCost(db, item.product_id, item.qty, invUnitCost);
      await db.runAsync(
        `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
         VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)`,
        [item.product_id, item.qty, invUnitCost, purchaseId, `Purchase ${invoiceNo}`]
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
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Purchase is saved; ledger refresh is best-effort housekeeping.
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

async function replacePurchaseItems(
  db: Awaited<ReturnType<typeof getDatabase>>,
  purchaseId: number,
  invoiceNo: string,
  items: PurchaseItemInput[],
  discount: number,
  supplierName: string,
  partyId?: number | null
): Promise<{
  subtotal: number;
  totalAmount: number;
  gst: ReturnType<typeof computeGstDocument>;
}> {
  validatePurchaseItems(items);

  const oldItems = await db.getAllAsync<{ product_id: number }>(
    'SELECT product_id FROM purchase_items WHERE purchase_id = ?',
    [purchaseId]
  );
  const affectedProducts = new Set([
    ...oldItems.map((row) => row.product_id),
    ...items.map((item) => item.product_id),
  ]);

  await db.runAsync(
    `DELETE FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id = ?`,
    [purchaseId]
  );
  await db.runAsync('DELETE FROM purchase_items WHERE purchase_id = ?', [purchaseId]);

  for (const productId of affectedProducts) {
    const { currentQty } = await recomputeProductStock(db, productId);
    if (currentQty < -0.0001) {
      const product = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM products WHERE id = ?',
        [productId]
      );
      throw new Error(
        `Cannot update: stock for ${product?.name ?? 'an item'} would go negative (already sold)`
      );
    }
  }

  const gst = await buildPurchaseGstChecked(db, {
    supplier_name: supplierName,
    party_id: partyId,
    items,
    discount_amount: discount,
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const line = gst.lines[i];
    const invTotal = line.taxable_amount;
    const invUnitCost = roundUnitCost(invTotal / item.qty);
    await db.runAsync(
      `INSERT INTO purchase_items (
         purchase_id, product_id, qty, unit_cost, total,
         hsn_sac, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchaseId,
        item.product_id,
        item.qty,
        invUnitCost,
        invTotal,
        line.hsn_sac,
        line.gst_rate,
        line.taxable_amount,
        line.cgst_amount,
        line.sgst_amount,
        line.igst_amount,
      ]
    );
    await updateWeightedAvgCost(db, item.product_id, item.qty, invUnitCost);
    await db.runAsync(
      `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
       VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)`,
      [item.product_id, item.qty, invUnitCost, purchaseId, `Purchase ${invoiceNo}`]
    );
  }

  return { subtotal: gst.subtotal, totalAmount: gst.total_amount, gst };
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
    items?: PurchaseItemInput[];
  }
): Promise<void> {
  const db = await getDatabase();
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) throw new Error('Purchase not found');

  const invoiceNo = params.invoice_no?.trim() || purchase.invoice_no;
  if (!invoiceNo) throw new Error('Purchase number is required');

  const discount = roundMoney(Math.max(0, params.discount_amount));
  if (Math.abs(discount - roundMoney(purchase.discount_amount ?? 0)) > 0.01) {
    throw new Error(
      'The discount is built into inventory costs and cannot be changed here. Delete this purchase and re-enter it to change the discount.'
    );
  }

  const supplierName = params.supplier_name.trim();
  const vendorInvoiceNo = params.vendor_invoice_no?.trim() || null;
  const invoiceChanged = invoiceNo !== purchase.invoice_no;

  await db.withTransactionAsync(async () => {
    let subtotal = purchase.subtotal;
    let totalAmount = purchase.total_amount;
    let gstFields = {
      taxable_amount: purchase.taxable_amount ?? purchase.subtotal,
      cgst_amount: purchase.cgst_amount ?? 0,
      sgst_amount: purchase.sgst_amount ?? 0,
      igst_amount: purchase.igst_amount ?? 0,
      is_inter_state: purchase.is_inter_state ?? 0,
      place_of_supply: purchase.place_of_supply ?? null,
    };

    if (params.items !== undefined) {
      const replaced = await replacePurchaseItems(
        db,
        purchaseId,
        invoiceNo,
        params.items,
        discount,
        supplierName,
        purchase.party_id
      );
      subtotal = replaced.subtotal;
      totalAmount = replaced.totalAmount;
      gstFields = {
        taxable_amount: replaced.gst.taxable_amount,
        cgst_amount: replaced.gst.cgst_amount,
        sgst_amount: replaced.gst.sgst_amount,
        igst_amount: replaced.gst.igst_amount,
        is_inter_state: replaced.gst.is_inter_state ? 1 : 0,
        place_of_supply: replaced.gst.place_of_supply,
      };
    } else {
      // Header-only edit: refresh CGST/SGST vs IGST from current vendor state without touching stock.
      const existingItems = await getPurchaseItems(purchaseId);
      const taxableBase = Math.max(0, subMoney(purchase.subtotal, discount));
      const grossFactor = taxableBase > 0.009 ? purchase.subtotal / taxableBase : 1;
      const rebuilt = await buildPurchaseGstChecked(db, {
        supplier_name: supplierName,
        party_id: purchase.party_id,
        items: existingItems.map((item) => {
          const taxable = item.taxable_amount ?? item.total;
          const preDiscountEx = taxable * grossFactor;
          return {
            product_id: item.product_id,
            qty: item.qty,
            unit_cost: item.qty > 0 ? preDiscountEx / item.qty : item.unit_cost,
            hsn_sac: item.hsn_sac,
            gst_rate: item.gst_rate,
          };
        }),
        discount_amount: discount,
        // Stored line costs are always exclusive taxable amounts.
        tax_inclusive: false,
      });
      if (Math.abs(rebuilt.total_amount - purchase.total_amount) > 0.05) {
        throw new Error(
          'Vendor/state change would alter the bill total. Edit line items and save to apply GST changes.'
        );
      }
      gstFields = {
        taxable_amount: rebuilt.taxable_amount,
        cgst_amount: rebuilt.cgst_amount,
        sgst_amount: rebuilt.sgst_amount,
        igst_amount: rebuilt.igst_amount,
        is_inter_state: rebuilt.is_inter_state ? 1 : 0,
        place_of_supply: rebuilt.place_of_supply,
      };
    }

    if (totalAmount + 0.01 < purchase.paid_amount) {
      throw new Error(
        `New total (${formatCurrency(totalAmount)}) cannot be less than the amount already paid (${formatCurrency(purchase.paid_amount)}). Remove payments first.`
      );
    }

    const status = getPaymentStatus(totalAmount, purchase.paid_amount);
    const partyId = await upsertParty(supplierName, 'vendor', db);
    await db.runAsync(
      `UPDATE purchases SET invoice_no = ?, party_id = ?, supplier_name = ?, vendor_invoice_no = ?, date = ?,
       subtotal = ?, discount_amount = ?,
       taxable_amount = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?,
       is_inter_state = ?, place_of_supply = ?,
       total_amount = ?, status = ?, notes = ? WHERE id = ?`,
      [
        invoiceNo,
        partyId,
        supplierName,
        vendorInvoiceNo,
        params.date,
        subtotal,
        discount,
        gstFields.taxable_amount,
        gstFields.cgst_amount,
        gstFields.sgst_amount,
        gstFields.igst_amount,
        gstFields.is_inter_state,
        gstFields.place_of_supply,
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

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Purchase is updated; ledger refresh is best-effort housekeeping.
  }

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

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Payment recorded; ledger refresh is best-effort housekeeping.
  }
}

export async function removePurchasePayment(purchaseId: number, paymentId: number): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    const payment = await db.getFirstAsync<{
      purchase_id: number;
      account_id: number;
      amount: number;
      date: string;
    }>(
      'SELECT purchase_id, account_id, amount, date FROM purchase_payments WHERE id = ?',
      [paymentId]
    );
    if (!payment || payment.purchase_id !== purchaseId) {
      throw new Error('Payment not found');
    }

    const linkedTx = await db.getFirstAsync<{ id: number; account_id: number; amount: number }>(
      `SELECT id, account_id, amount FROM transactions
       WHERE payment_id = ? AND reference_type = 'purchase' AND reference_id = ? AND type = 'purchase_payment'`,
      [paymentId, purchaseId]
    );

    if (linkedTx) {
      await updateAccountBalance(db, linkedTx.account_id, -linkedTx.amount);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [linkedTx.id]);
    } else {
      const legacy = pickLegacyPaymentMatch(
        await db.getAllAsync<{ id: number }>(
          `SELECT id FROM transactions
           WHERE reference_type = 'purchase' AND reference_id = ? AND type = 'purchase_payment'
             AND account_id = ? AND amount = ? AND date = ? AND payment_id IS NULL`,
          [purchaseId, payment.account_id, -payment.amount, payment.date]
        )
      );
      await updateAccountBalance(db, payment.account_id, -(-payment.amount));
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [legacy.id]);
    }

    await db.runAsync('DELETE FROM purchase_payments WHERE id = ?', [paymentId]);

    const purchase = await db.getFirstAsync<{ total_amount: number }>(
      'SELECT total_amount FROM purchases WHERE id = ?',
      [purchaseId]
    );
    if (!purchase) throw new Error('Purchase not found');

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

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Purchase payment removed; ledger refresh is best-effort housekeeping.
  }
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
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // The purchase was deleted; ledger refresh is best-effort housekeeping.
  }
}

import {
  getDatabase,
  getPaymentStatus,
  recomputeProductStock,
  recordTransaction,
  reduceInventory,
  reverseTransactionsByReference,
  updateAccountBalance,
} from '../db/database';
import { resolveSaleInvoiceNo, syncNextInvoiceSettingAfterUse } from './invoiceNumbers';
import { upsertParty } from './parties';
import { assertGstPlaceOfSupply, computeGstDocument, enforceInvoiceTypeForTax } from './gst';
import { getBusinessState, isGstEnabled, isTaxInclusivePricing } from './appSettings';
import { formatCurrency } from '../utils/format';
import { addMoney, roundMoney, subMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import { pickLegacyPaymentMatch } from '../utils/paymentPair';
import type { PaymentInput, Sale, SaleInvoiceType, SaleItem, SaleItemInput, SalePayment } from '../types';

function normalizeInvoiceType(value?: string | null): SaleInvoiceType {
  return value === 'bos' ? 'bos' : 'invoice';
}

function validateSaleItems(items: SaleItemInput[]): void {
  if (items.length === 0) throw new Error('Add at least one item');
  for (const item of items) {
    if (item.qty <= 0) throw new Error('Item quantity must be greater than zero');
    if (item.unit_price <= 0) throw new Error('Item unit price must be greater than zero');
  }
}

async function resolvePartyState(
  db: Awaited<ReturnType<typeof getDatabase>>,
  partyName: string,
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
    `SELECT state, gstin FROM parties WHERE name = ? COLLATE NOCASE AND type = 'customer' LIMIT 1`,
    [partyName.trim()]
  );
  if (byName?.state) return byName.state;
  if (byName?.gstin) {
    const { stateCodeFromGstin } = await import('./gst');
    return stateCodeFromGstin(byName.gstin);
  }
  return null;
}

async function buildSaleGst(
  db: Awaited<ReturnType<typeof getDatabase>>,
  params: {
    party_name: string;
    party_id?: number | null;
    items: SaleItemInput[];
    discount_amount?: number;
    service_charges?: number;
    invoice_type?: SaleInvoiceType;
  }
) {
  const gstEnabled = await isGstEnabled();
  const businessState = await getBusinessState();
  const taxInclusive = await isTaxInclusivePricing();
  const partyState = await resolvePartyState(db, params.party_name, params.party_id);
  const gst = computeGstDocument({
    lines: params.items.map((item) => ({
      qty: item.qty,
      unit_price: item.unit_price,
      gst_rate: item.gst_rate,
      hsn_sac: item.hsn_sac,
    })),
    discount_amount: params.discount_amount,
    service_charges: params.service_charges,
    business_state: businessState,
    party_state: partyState,
    gst_enabled: gstEnabled,
    tax_inclusive: taxInclusive,
  });
  assertGstPlaceOfSupply({
    gst_enabled: gstEnabled,
    tax_amount: gst.tax_amount,
    business_state: businessState,
    party_state: partyState,
  });
  // Honour explicit invoice_type from UI only when it remains valid with tax.
  let invoiceType = params.invoice_type
    ? normalizeInvoiceType(params.invoice_type)
    : gst.suggested_invoice_type;
  invoiceType = enforceInvoiceTypeForTax(invoiceType, gst.tax_amount);
  if (params.invoice_type === 'bos' && gst.tax_amount > 0.009) {
    throw new Error(
      'Bill of Supply cannot include GST. Clear tax rates or switch to Tax Invoice.'
    );
  }
  return { gst, invoiceType, partyState };
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
  options?: {
    limit?: number;
    offset?: number;
    periodKey?: string;
    invoiceType?: 'all' | SaleInvoiceType;
  }
): Promise<Sale[]> {
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

  if (options?.invoiceType === 'invoice' || options?.invoiceType === 'bos') {
    conditions.push('invoice_type = ?');
    params.push(options.invoiceType);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  let query = `SELECT * FROM sales ${where} ORDER BY date DESC, id DESC`;

  if (options?.limit) {
    query += ' LIMIT ? OFFSET ?';
    params.push(options.limit, options.offset ?? 0);
  }

  const rows = await db.getAllAsync<Sale>(query, params);
  return rows.map((row) => ({ ...row, invoice_type: normalizeInvoiceType(row.invoice_type) }));
}

export async function getSaleById(id: number): Promise<Sale | null> {
  const db = await getDatabase();
  const sale = await db.getFirstAsync<Sale>('SELECT * FROM sales WHERE id = ?', [id]);
  if (!sale) return null;
  return { ...sale, invoice_type: normalizeInvoiceType(sale.invoice_type) };
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
  invoice_type?: SaleInvoiceType;
}): Promise<number> {
  validateSaleItems(params.items);

  const db = await getDatabase();
  const { gst, invoiceType } = await buildSaleGst(db, params);
  const subtotal = gst.subtotal;
  const discount = gst.discount_amount;
  const serviceCharges = gst.service_charges;
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
  let saleId = 0;

  await db.withTransactionAsync(async () => {
    const invoiceNo = await resolveSaleInvoiceNo(params.invoice_no, invoiceType);
    const partyId = await upsertParty(params.party_name, 'customer', db, params.party_phone);

    const result = await db.runAsync(
      `INSERT INTO sales (
         invoice_no, invoice_type, party_id, party_name, date, subtotal, discount_amount, service_charges,
         taxable_amount, cgst_amount, sgst_amount, igst_amount, is_inter_state, place_of_supply,
         total_amount, paid_amount, status, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        invoiceType,
        partyId,
        params.party_name,
        params.date,
        subtotal,
        discount,
        serviceCharges,
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
    saleId = result.lastInsertRowId;

    const unitCosts: number[] = [];
    for (let i = 0; i < params.items.length; i++) {
      unitCosts.push(await reduceInventory(db, params.items[i].product_id, params.items[i].qty));
    }

    for (let i = 0; i < params.items.length; i++) {
      const item = params.items[i];
      const line = gst.lines[i];
      await db.runAsync(
        `INSERT INTO sale_items (
           sale_id, product_id, qty, unit_price, unit_cost, total,
           hsn_sac, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          item.product_id,
          item.qty,
          item.unit_price,
          unitCosts[i],
          line.line_total,
          line.hsn_sac,
          line.gst_rate,
          line.taxable_amount,
          line.cgst_amount,
          line.sgst_amount,
          line.igst_amount,
        ]
      );
      await db.runAsync(
        `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
         VALUES (?, 'sale', ?, ?, 'sale', ?, ?)`,
        [
          item.product_id,
          -item.qty,
          unitCosts[i],
          saleId,
          `${invoiceType === 'bos' ? 'BOS' : 'Sale'} ${invoiceNo}`,
        ]
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
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Sale is saved; ledger refresh is best-effort housekeeping.
  }

  try {
    const sale = await getSaleById(saleId);
    if (sale) {
      await syncNextInvoiceSettingAfterUse(
        sale.invoice_type === 'bos' ? 'bos' : 'sale',
        sale.invoice_no
      );
    }
  } catch {
    // Counter sync failure must not fail an already-created sale.
  }

  return saleId;
}

async function replaceSaleItems(
  db: Awaited<ReturnType<typeof getDatabase>>,
  saleId: number,
  invoiceNo: string,
  items: SaleItemInput[],
  invoiceType: SaleInvoiceType,
  gstLines: ReturnType<typeof computeGstDocument>['lines']
): Promise<number> {
  validateSaleItems(items);

  const oldItems = await db.getAllAsync<{ product_id: number }>(
    'SELECT product_id FROM sale_items WHERE sale_id = ?',
    [saleId]
  );
  const affectedProducts = new Set([
    ...oldItems.map((row) => row.product_id),
    ...items.map((item) => item.product_id),
  ]);

  await db.runAsync(
    `DELETE FROM inventory_movements WHERE reference_type = 'sale' AND reference_id = ?`,
    [saleId]
  );
  await db.runAsync('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);

  for (const productId of affectedProducts) {
    await recomputeProductStock(db, productId);
  }

  const qtyByProduct = new Map<number, number>();
  for (const item of items) {
    qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + item.qty);
  }
  for (const [productId, qty] of qtyByProduct) {
    const product = await db.getFirstAsync<{ current_qty: number; name: string }>(
      'SELECT current_qty, name FROM products WHERE id = ?',
      [productId]
    );
    if (product && product.current_qty + 0.0001 < qty) {
      throw new Error(
        `Insufficient stock for ${product.name} (only ${product.current_qty} available)`
      );
    }
  }

  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const line = gstLines[i];
    subtotal = addMoney(subtotal, line.line_total);
    const unitCost = await reduceInventory(db, item.product_id, item.qty);
    await db.runAsync(
      `INSERT INTO sale_items (
         sale_id, product_id, qty, unit_price, unit_cost, total,
         hsn_sac, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleId,
        item.product_id,
        item.qty,
        item.unit_price,
        unitCost,
        line.line_total,
        line.hsn_sac,
        line.gst_rate,
        line.taxable_amount,
        line.cgst_amount,
        line.sgst_amount,
        line.igst_amount,
      ]
    );
    await db.runAsync(
      `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, reference_id, notes)
       VALUES (?, 'sale', ?, ?, 'sale', ?, ?)`,
      [
        item.product_id,
        -item.qty,
        unitCost,
        saleId,
        `${invoiceType === 'bos' ? 'BOS' : 'Sale'} ${invoiceNo}`,
      ]
    );
  }

  return subtotal;
}

export async function updateSale(
  saleId: number,
  params: {
    party_name: string;
    party_phone?: string;
    date: string;
    invoice_no?: string;
    invoice_type?: SaleInvoiceType;
    discount_amount: number;
    service_charges?: number;
    notes?: string;
    items?: SaleItemInput[];
  }
): Promise<void> {
  const db = await getDatabase();
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error('Sale not found');

  const invoiceNo = params.invoice_no?.trim() || sale.invoice_no;
  if (!invoiceNo) throw new Error('Invoice number is required');

  const partyName = params.party_name.trim();
  const invoiceChanged = invoiceNo !== sale.invoice_no;
  const invoiceType = normalizeInvoiceType(params.invoice_type ?? sale.invoice_type);
  const invoiceTypeChanged = invoiceType !== sale.invoice_type;
  const discount = roundMoney(Math.max(0, params.discount_amount));
  const serviceCharges = roundMoney(Math.max(0, params.service_charges ?? sale.service_charges ?? 0));

  await db.withTransactionAsync(async () => {
    let subtotal = sale.subtotal;
    let gst = {
      taxable_amount: sale.taxable_amount ?? sale.subtotal,
      cgst_amount: sale.cgst_amount ?? 0,
      sgst_amount: sale.sgst_amount ?? 0,
      igst_amount: sale.igst_amount ?? 0,
      is_inter_state: !!(sale.is_inter_state ?? 0),
      place_of_supply: sale.place_of_supply ?? null,
      total_amount: sale.total_amount,
      lines: [] as ReturnType<typeof computeGstDocument>['lines'],
    };

    if (params.items !== undefined) {
      const built = await buildSaleGst(db, {
        party_name: partyName,
        party_id: sale.party_id,
        items: params.items,
        discount_amount: discount,
        service_charges: serviceCharges,
        invoice_type: invoiceType,
      });
      gst = built.gst;
      subtotal = await replaceSaleItems(
        db,
        saleId,
        invoiceNo,
        params.items,
        invoiceType,
        built.gst.lines
      );
    } else {
      const existingItems = await getSaleItems(saleId);
      const built = await buildSaleGst(db, {
        party_name: partyName,
        party_id: sale.party_id,
        items: existingItems.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          unit_price: item.unit_price,
          hsn_sac: item.hsn_sac,
          gst_rate: item.gst_rate,
        })),
        discount_amount: discount,
        service_charges: serviceCharges,
        invoice_type: invoiceType,
      });
      gst = built.gst;
      subtotal = built.gst.subtotal;
    }

    const totalAmount = gst.total_amount;
    if (totalAmount + 0.01 < sale.paid_amount) {
      throw new Error(
        `New total (${formatCurrency(totalAmount)}) cannot be less than the amount already paid (${formatCurrency(sale.paid_amount)}). Remove payments first.`
      );
    }

    const status = getPaymentStatus(totalAmount, sale.paid_amount);
    const partyId = await upsertParty(partyName, 'customer', db, params.party_phone);
    await db.runAsync(
      `UPDATE sales SET invoice_no = ?, invoice_type = ?, party_id = ?, party_name = ?, date = ?,
       subtotal = ?, discount_amount = ?, service_charges = ?,
       taxable_amount = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?,
       is_inter_state = ?, place_of_supply = ?,
       total_amount = ?, status = ?, notes = ? WHERE id = ?`,
      [
        invoiceNo,
        invoiceType,
        partyId,
        partyName,
        params.date,
        subtotal,
        discount,
        serviceCharges,
        gst.taxable_amount,
        gst.cgst_amount,
        gst.sgst_amount,
        gst.igst_amount,
        gst.is_inter_state ? 1 : 0,
        gst.place_of_supply,
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
    if (invoiceChanged || invoiceTypeChanged) {
      await db.runAsync(
        `UPDATE inventory_movements SET notes = ? WHERE reference_type = 'sale' AND reference_id = ?`,
        [`${invoiceType === 'bos' ? 'BOS' : 'Sale'} ${invoiceNo}`, saleId]
      );
    }
  });

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Sale is updated; ledger refresh is best-effort housekeeping.
  }

  if (invoiceChanged || invoiceTypeChanged) {
    try {
      await syncNextInvoiceSettingAfterUse(
        invoiceType === 'bos' ? 'bos' : 'sale',
        invoiceNo
      );
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

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Payment recorded; ledger refresh is best-effort housekeeping.
  }
}

export async function removeSalePayment(saleId: number, paymentId: number): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    const payment = await db.getFirstAsync<{
      sale_id: number;
      account_id: number;
      amount: number;
      date: string;
    }>(
      'SELECT sale_id, account_id, amount, date FROM sale_payments WHERE id = ?',
      [paymentId]
    );
    if (!payment || payment.sale_id !== saleId) {
      throw new Error('Payment not found');
    }

    const linkedTx = await db.getFirstAsync<{ id: number; account_id: number; amount: number }>(
      `SELECT id, account_id, amount FROM transactions
       WHERE payment_id = ? AND reference_type = 'sale' AND reference_id = ? AND type = 'sale_payment'`,
      [paymentId, saleId]
    );

    if (linkedTx) {
      await updateAccountBalance(db, linkedTx.account_id, -linkedTx.amount);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [linkedTx.id]);
    } else {
      const legacy = pickLegacyPaymentMatch(
        await db.getAllAsync<{ id: number }>(
          `SELECT id FROM transactions
           WHERE reference_type = 'sale' AND reference_id = ? AND type = 'sale_payment'
             AND account_id = ? AND amount = ? AND date = ? AND payment_id IS NULL`,
          [saleId, payment.account_id, payment.amount, payment.date]
        )
      );
      await updateAccountBalance(db, payment.account_id, -payment.amount);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [legacy.id]);
    }

    await db.runAsync('DELETE FROM sale_payments WHERE id = ?', [paymentId]);

    const sale = await db.getFirstAsync<{ total_amount: number }>(
      'SELECT total_amount FROM sales WHERE id = ?',
      [saleId]
    );
    if (!sale) throw new Error('Sale not found');

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

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // Sale payment removed; ledger refresh is best-effort housekeeping.
  }
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
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // The sale was deleted; ledger refresh is best-effort housekeeping.
  }
}

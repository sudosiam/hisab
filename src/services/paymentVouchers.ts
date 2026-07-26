import {
  getDatabase,
  getPaymentStatus,
  recordTransaction,
} from '../db/database';
import { upsertParty } from './parties';
import { createAccount, getSelectableAccounts } from './banking';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import type {
  PaymentBillType,
  PaymentVoucher,
  PaymentVoucherAllocation,
  PaymentVoucherLine,
  PaymentVoucherType,
  PartyType,
} from '../types';

export interface PaymentVoucherLineInput {
  ledger_name: string;
  is_party?: boolean;
  is_bank_cash?: boolean;
  amount: number;
  is_deemed_positive?: boolean;
}

export interface PaymentVoucherAllocationInput {
  bill_name: string;
  bill_type: PaymentBillType;
  amount: number;
}

export interface CreatePaymentVoucherParams {
  voucher_type: PaymentVoucherType;
  voucher_no: string;
  date: string;
  party_name: string;
  party_type?: PartyType;
  account_name?: string;
  account_id?: number;
  amount: number;
  narration?: string;
  instrument_no?: string;
  instrument_bank?: string;
  payment_mode?: string;
  lines: PaymentVoucherLineInput[];
  allocations: PaymentVoucherAllocationInput[];
}

function normalizeVoucherNo(value: string): string {
  return String(value ?? '').trim();
}

export async function paymentVoucherExists(
  voucherType: PaymentVoucherType,
  voucherNo: string,
  date: string
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM payment_vouchers
     WHERE voucher_type = ? AND voucher_no = ? COLLATE NOCASE AND date = ?
     LIMIT 1`,
    [voucherType, normalizeVoucherNo(voucherNo), date]
  );
  return !!row;
}

async function ensureCashBankAccount(
  preferredName?: string,
  preferredId?: number
): Promise<number> {
  if (preferredId) return preferredId;
  const accounts = await getSelectableAccounts();
  if (preferredName?.trim()) {
    const existing = accounts.find(
      (a) => a.name.trim().toLowerCase() === preferredName.trim().toLowerCase()
    );
    if (existing) return existing.id;
    const lower = preferredName.toLowerCase();
    const type = lower.includes('cash') ? 'cash' : 'bank';
    return createAccount({ name: preferredName.trim(), type, opening_balance: 0 });
  }
  if (accounts.length > 0) return accounts[0].id;
  return createAccount({ name: 'Cash', type: 'cash', opening_balance: 0 });
}

async function findSaleByBillName(billName: string, partyName?: string) {
  const db = await getDatabase();
  const name = billName.trim();
  if (!name) return null;
  const party = partyName?.trim() || '';
  // Prefer open invoice for this party (FIFO-safe when invoice numbers collide).
  if (party) {
    const openForParty = await db.getFirstAsync<{
      id: number;
      invoice_no: string;
      total_amount: number;
      paid_amount: number;
      party_name: string;
    }>(
      `SELECT id, invoice_no, total_amount, paid_amount, party_name FROM sales
       WHERE invoice_no = ? COLLATE NOCASE
         AND party_name = ? COLLATE NOCASE
         AND (total_amount - paid_amount) > 0.009
       ORDER BY date ASC, id ASC LIMIT 1`,
      [name, party]
    );
    if (openForParty) return openForParty;
    const anyForParty = await db.getFirstAsync<{
      id: number;
      invoice_no: string;
      total_amount: number;
      paid_amount: number;
      party_name: string;
    }>(
      `SELECT id, invoice_no, total_amount, paid_amount, party_name FROM sales
       WHERE invoice_no = ? COLLATE NOCASE AND party_name = ? COLLATE NOCASE
       ORDER BY id DESC LIMIT 1`,
      [name, party]
    );
    if (anyForParty) return anyForParty;
  }
  return db.getFirstAsync<{
    id: number;
    invoice_no: string;
    total_amount: number;
    paid_amount: number;
    party_name: string;
  }>(
    `SELECT id, invoice_no, total_amount, paid_amount, party_name FROM sales
     WHERE invoice_no = ? COLLATE NOCASE
     ORDER BY id DESC LIMIT 1`,
    [name]
  );
}

async function findPurchaseByBillName(billName: string, partyName?: string) {
  const db = await getDatabase();
  const name = billName.trim();
  if (!name) return null;
  const party = partyName?.trim() || '';
  if (party) {
    const openForParty = await db.getFirstAsync<{
      id: number;
      invoice_no: string;
      vendor_invoice_no: string | null;
      total_amount: number;
      paid_amount: number;
      supplier_name: string;
    }>(
      `SELECT id, invoice_no, vendor_invoice_no, total_amount, paid_amount, supplier_name FROM purchases
       WHERE (invoice_no = ? COLLATE NOCASE OR vendor_invoice_no = ? COLLATE NOCASE)
         AND supplier_name = ? COLLATE NOCASE
         AND (total_amount - paid_amount) > 0.009
       ORDER BY date ASC, id ASC LIMIT 1`,
      [name, name, party]
    );
    if (openForParty) return openForParty;
    const anyForParty = await db.getFirstAsync<{
      id: number;
      invoice_no: string;
      vendor_invoice_no: string | null;
      total_amount: number;
      paid_amount: number;
      supplier_name: string;
    }>(
      `SELECT id, invoice_no, vendor_invoice_no, total_amount, paid_amount, supplier_name FROM purchases
       WHERE (invoice_no = ? COLLATE NOCASE OR vendor_invoice_no = ? COLLATE NOCASE)
         AND supplier_name = ? COLLATE NOCASE
       ORDER BY id DESC LIMIT 1`,
      [name, name, party]
    );
    if (anyForParty) return anyForParty;
  }
  return db.getFirstAsync<{
    id: number;
    invoice_no: string;
    vendor_invoice_no: string | null;
    total_amount: number;
    paid_amount: number;
    supplier_name: string;
  }>(
    `SELECT id, invoice_no, vendor_invoice_no, total_amount, paid_amount, supplier_name FROM purchases
     WHERE invoice_no = ? COLLATE NOCASE OR vendor_invoice_no = ? COLLATE NOCASE
     ORDER BY id DESC LIMIT 1`,
    [name, name]
  );
}

/**
 * When Tally omits BILLALLOCATIONS (common in exports), apply the voucher amount
 * FIFO against open invoices for the same party. Leftover stays on-account/advance.
 */
export async function planFifoAllocationsAgainstOpenInvoices(
  voucherType: PaymentVoucherType,
  partyName: string,
  amount: number
): Promise<PaymentVoucherAllocationInput[]> {
  const total = roundMoney(Math.abs(amount));
  if (!(total > 0.009) || !partyName.trim()) {
    return [{ bill_name: 'On Account', bill_type: 'on_account', amount: total }];
  }

  const db = await getDatabase();
  const open =
    voucherType === 'receipt'
      ? await db.getAllAsync<{
          invoice_no: string;
          total_amount: number;
          paid_amount: number;
        }>(
          `SELECT invoice_no, total_amount, paid_amount FROM sales
           WHERE party_name = ? COLLATE NOCASE
             AND (total_amount - paid_amount) > 0.009
           ORDER BY date ASC, id ASC`,
          [partyName.trim()]
        )
      : await db.getAllAsync<{
          invoice_no: string;
          total_amount: number;
          paid_amount: number;
        }>(
          `SELECT invoice_no, total_amount, paid_amount FROM purchases
           WHERE supplier_name = ? COLLATE NOCASE
             AND (total_amount - paid_amount) > 0.009
           ORDER BY date ASC, id ASC`,
          [partyName.trim()]
        );

  const allocations: PaymentVoucherAllocationInput[] = [];
  let remaining = total;
  for (const inv of open) {
    if (remaining <= 0.009) break;
    const due = roundMoney(Math.max(0, inv.total_amount - inv.paid_amount));
    if (due <= 0.009) continue;
    const apply = roundMoney(Math.min(remaining, due));
    allocations.push({
      bill_name: inv.invoice_no,
      bill_type: 'agst_ref',
      amount: apply,
    });
    remaining = roundMoney(remaining - apply);
  }

  if (remaining > 0.009) {
    allocations.push({
      bill_name: 'On Account',
      bill_type: 'on_account',
      amount: remaining,
    });
  }

  if (allocations.length === 0) {
    return [{ bill_name: 'On Account', bill_type: 'on_account', amount: total }];
  }
  return allocations;
}

/**
 * Create a Receipt (inward) or Payment (outward) voucher.
 * Agst Ref allocations create linked sale/purchase payments.
 * Advance / on-account / unmatched amounts stay on the voucher and move cash once.
 */
export async function createPaymentVoucher(
  params: CreatePaymentVoucherParams
): Promise<number> {
  const voucherNo = normalizeVoucherNo(params.voucher_no);
  if (!voucherNo) throw new Error('Voucher number is required');
  if (!params.date?.trim()) throw new Error('Voucher date is required');
  if (!params.party_name.trim()) throw new Error('Party is required');

  const amount = roundMoney(Math.abs(params.amount));
  if (!(amount > 0)) throw new Error('Voucher amount must be greater than zero');

  if (await paymentVoucherExists(params.voucher_type, voucherNo, params.date)) {
    throw new Error(`Duplicate ${params.voucher_type} voucher ${voucherNo} on ${params.date}`);
  }

  const partyType: PartyType =
    params.party_type ?? (params.voucher_type === 'receipt' ? 'customer' : 'vendor');
  const partyId = await upsertParty(params.party_name, partyType);
  const accountId = await ensureCashBankAccount(params.account_name, params.account_id);

  const allocations =
    params.allocations.length > 0
      ? params.allocations
      : [{ bill_name: 'On Account', bill_type: 'on_account' as const, amount }];

  const db = await getDatabase();
  let voucherId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO payment_vouchers (
         voucher_type, voucher_no, date, party_id, party_name, party_type,
         account_id, amount, narration, instrument_no, instrument_bank, payment_mode
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.voucher_type,
        voucherNo,
        params.date,
        partyId,
        params.party_name.trim(),
        partyType,
        accountId,
        amount,
        params.narration?.trim() || null,
        params.instrument_no?.trim() || null,
        params.instrument_bank?.trim() || null,
        params.payment_mode?.trim() || null,
      ]
    );
    voucherId = result.lastInsertRowId;

    for (const line of params.lines) {
      await db.runAsync(
        `INSERT INTO payment_voucher_lines (
           voucher_id, ledger_name, is_party, is_bank_cash, amount, is_deemed_positive
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          voucherId,
          line.ledger_name.trim(),
          line.is_party ? 1 : 0,
          line.is_bank_cash ? 1 : 0,
          roundMoney(line.amount),
          line.is_deemed_positive ? 1 : 0,
        ]
      );
    }

    let allocatedToInvoices = 0;

    for (const alloc of allocations) {
      const allocAmount = roundMoney(Math.abs(alloc.amount));
      if (!(allocAmount > 0.009)) continue;

      let billType = alloc.bill_type;
      let saleId: number | null = null;
      let purchaseId: number | null = null;
      let salePaymentId: number | null = null;
      let purchasePaymentId: number | null = null;

      if (billType === 'agst_ref') {
        if (params.voucher_type === 'receipt') {
          const sale = await findSaleByBillName(alloc.bill_name, params.party_name);
          if (sale) {
            saleId = sale.id;
            const due = roundMoney(Math.max(0, sale.total_amount - sale.paid_amount));
            const payAmount = roundMoney(Math.min(allocAmount, due > 0 ? due : allocAmount));
            if (payAmount > 0.009) {
              const payResult = await db.runAsync(
                `INSERT INTO sale_payments (sale_id, account_id, amount, date, notes)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  sale.id,
                  accountId,
                  payAmount,
                  params.date,
                  `Tally Receipt ${voucherNo}`,
                ]
              );
              salePaymentId = payResult.lastInsertRowId;
              await recordTransaction(db, {
                account_id: accountId,
                type: 'sale_payment',
                amount: payAmount,
                reference_type: 'sale',
                reference_id: sale.id,
                payment_id: salePaymentId,
                description: `Receipt ${voucherNo} for ${sale.invoice_no} - ${sale.party_name}`,
                date: params.date,
              });
              const sumRow = await db.getFirstAsync<{ total: number }>(
                `SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ?`,
                [sale.id]
              );
              const newPaid = roundMoney(sumRow?.total ?? 0);
              await db.runAsync('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?', [
                newPaid,
                getPaymentStatus(sale.total_amount, newPaid),
                sale.id,
              ]);
              allocatedToInvoices = roundMoney(allocatedToInvoices + payAmount);
            }
          } else {
            billType = 'on_account';
          }
        } else {
          const purchase = await findPurchaseByBillName(alloc.bill_name, params.party_name);
          if (purchase) {
            purchaseId = purchase.id;
            const due = roundMoney(Math.max(0, purchase.total_amount - purchase.paid_amount));
            const payAmount = roundMoney(Math.min(allocAmount, due > 0 ? due : allocAmount));
            if (payAmount > 0.009) {
              const payResult = await db.runAsync(
                `INSERT INTO purchase_payments (purchase_id, account_id, amount, date, notes)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  purchase.id,
                  accountId,
                  payAmount,
                  params.date,
                  `Tally Payment ${voucherNo}`,
                ]
              );
              purchasePaymentId = payResult.lastInsertRowId;
              await recordTransaction(db, {
                account_id: accountId,
                type: 'purchase_payment',
                amount: -payAmount,
                reference_type: 'purchase',
                reference_id: purchase.id,
                payment_id: purchasePaymentId,
                description: `Payment ${voucherNo} for ${purchase.invoice_no} - ${purchase.supplier_name}`,
                date: params.date,
              });
              const sumRow = await db.getFirstAsync<{ total: number }>(
                `SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_payments WHERE purchase_id = ?`,
                [purchase.id]
              );
              const newPaid = roundMoney(sumRow?.total ?? 0);
              await db.runAsync('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?', [
                newPaid,
                getPaymentStatus(purchase.total_amount, newPaid),
                purchase.id,
              ]);
              allocatedToInvoices = roundMoney(allocatedToInvoices + payAmount);
            }
          } else {
            billType = 'on_account';
          }
        }
      }

      await db.runAsync(
        `INSERT INTO payment_voucher_allocations (
           voucher_id, bill_name, bill_type, amount,
           sale_id, purchase_id, sale_payment_id, purchase_payment_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          voucherId,
          alloc.bill_name.trim() || 'On Account',
          billType,
          allocAmount,
          saleId,
          purchaseId,
          salePaymentId,
          purchasePaymentId,
        ]
      );
    }

    const unallocated = roundMoney(Math.max(0, amount - allocatedToInvoices));
    if (unallocated > 0.009) {
      await recordTransaction(db, {
        account_id: accountId,
        type: params.voucher_type === 'receipt' ? 'party_receipt' : 'party_payment',
        amount: params.voucher_type === 'receipt' ? unallocated : -unallocated,
        reference_type: 'payment_voucher',
        reference_id: voucherId,
        description: `${params.voucher_type === 'receipt' ? 'Receipt' : 'Payment'} ${voucherNo} - ${params.party_name.trim()} (on account/advance)`,
        date: params.date,
      });
    }
  });

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // best-effort
  }

  return voucherId;
}

export type PaymentVoucherListItem = PaymentVoucher & {
  allocation_kind: 'against_invoice' | 'advance' | 'on_account' | 'mixed';
};

export async function getPaymentVouchers(options?: {
  periodKey?: string;
  voucherType?: PaymentVoucherType | 'all';
  /** Only vouchers that still hold advance/on-account credit. */
  advanceOnly?: boolean;
}): Promise<PaymentVoucherListItem[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (options?.periodKey) {
    const { start, end } = await resolvePeriodRange(options.periodKey);
    conditions.push('v.date >= ? AND v.date <= ?');
    params.push(start, end);
  }
  if (options?.voucherType === 'receipt' || options?.voucherType === 'payment') {
    conditions.push('v.voucher_type = ?');
    params.push(options.voucherType);
  }
  if (options?.advanceOnly) {
    conditions.push(`EXISTS (
      SELECT 1 FROM payment_voucher_allocations a
      WHERE a.voucher_id = v.id
        AND a.bill_type IN ('advance', 'on_account', 'new_ref')
        AND a.sale_payment_id IS NULL
        AND a.purchase_payment_id IS NULL
    )`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.getAllAsync<
    PaymentVoucher & { linked_count: number; advance_count: number; alloc_count: number }
  >(
    `SELECT v.*,
       COALESCE((
         SELECT COUNT(*) FROM payment_voucher_allocations a
         WHERE a.voucher_id = v.id
           AND (a.sale_payment_id IS NOT NULL OR a.purchase_payment_id IS NOT NULL)
       ), 0) as linked_count,
       COALESCE((
         SELECT COUNT(*) FROM payment_voucher_allocations a
         WHERE a.voucher_id = v.id
           AND a.bill_type IN ('advance', 'on_account', 'new_ref')
           AND a.sale_payment_id IS NULL
           AND a.purchase_payment_id IS NULL
       ), 0) as advance_count,
       COALESCE((
         SELECT COUNT(*) FROM payment_voucher_allocations a WHERE a.voucher_id = v.id
       ), 0) as alloc_count
     FROM payment_vouchers v
     ${where}
     ORDER BY v.date DESC, v.id DESC`,
    params
  );

  return rows.map((row) => {
    let allocation_kind: PaymentVoucherListItem['allocation_kind'] = 'on_account';
    if (row.linked_count > 0 && row.advance_count > 0) allocation_kind = 'mixed';
    else if (row.linked_count > 0) allocation_kind = 'against_invoice';
    else if (row.advance_count > 0) {
      // Prefer advance label when any advance row exists; else on account.
      allocation_kind = 'advance';
    }
    const { linked_count: _l, advance_count: _a, alloc_count: _c, ...voucher } = row;
    return { ...voucher, allocation_kind };
  });
}

export async function getPaymentVoucherById(id: number): Promise<{
  voucher: PaymentVoucher;
  lines: PaymentVoucherLine[];
  allocations: PaymentVoucherAllocation[];
} | null> {
  const db = await getDatabase();
  const voucher = await db.getFirstAsync<PaymentVoucher>(
    'SELECT * FROM payment_vouchers WHERE id = ?',
    [id]
  );
  if (!voucher) return null;
  const [lines, allocations] = await Promise.all([
    getPaymentVoucherLines(id),
    getPaymentVoucherAllocations(id),
  ]);
  return { voucher, lines, allocations };
}

export async function getNextPaymentVoucherNo(type: PaymentVoucherType): Promise<string> {
  const db = await getDatabase();
  const prefix = type === 'receipt' ? 'R-' : 'P-';
  const row = await db.getFirstAsync<{ voucher_no: string }>(
    `SELECT voucher_no FROM payment_vouchers
     WHERE voucher_type = ? AND voucher_no LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [type, `${prefix}%`]
  );
  if (!row?.voucher_no) return `${prefix}0001`;
  const match = row.voucher_no.match(/(\d+)\s*$/);
  const next = match ? Number(match[1]) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function getOpenInvoicesForParty(
  partyName: string,
  kind: 'receipt' | 'payment'
): Promise<{ id: number; invoice_no: string; date: string; due: number }[]> {
  const db = await getDatabase();
  if (kind === 'receipt') {
    const rows = await db.getAllAsync<{
      id: number;
      invoice_no: string;
      date: string;
      total_amount: number;
      paid_amount: number;
    }>(
      `SELECT id, invoice_no, date, total_amount, paid_amount FROM sales
       WHERE party_name = ? COLLATE NOCASE
         AND total_amount - paid_amount > 0.01
       ORDER BY date ASC, id ASC`,
      [partyName.trim()]
    );
    return rows.map((r) => ({
      id: r.id,
      invoice_no: r.invoice_no,
      date: r.date,
      due: roundMoney(r.total_amount - r.paid_amount),
    }));
  }
  const rows = await db.getAllAsync<{
    id: number;
    invoice_no: string;
    date: string;
    total_amount: number;
    paid_amount: number;
  }>(
    `SELECT id, invoice_no, date, total_amount, paid_amount FROM purchases
     WHERE supplier_name = ? COLLATE NOCASE
       AND total_amount - paid_amount > 0.01
     ORDER BY date ASC, id ASC`,
    [partyName.trim()]
  );
  return rows.map((r) => ({
    id: r.id,
    invoice_no: r.invoice_no,
    date: r.date,
    due: roundMoney(r.total_amount - r.paid_amount),
  }));
}

export async function getPaymentVoucherLines(voucherId: number): Promise<PaymentVoucherLine[]> {
  const db = await getDatabase();
  return db.getAllAsync<PaymentVoucherLine>(
    'SELECT * FROM payment_voucher_lines WHERE voucher_id = ? ORDER BY id ASC',
    [voucherId]
  );
}

export async function getPaymentVoucherAllocations(
  voucherId: number
): Promise<PaymentVoucherAllocation[]> {
  const db = await getDatabase();
  return db.getAllAsync<PaymentVoucherAllocation>(
    'SELECT * FROM payment_voucher_allocations WHERE voucher_id = ? ORDER BY id ASC',
    [voucherId]
  );
}

/** Unallocated advance/on-account credit still sitting on party (reduces due). */
export async function getPartyUnallocatedPaymentCredit(
  partyName: string,
  partyType: PartyType
): Promise<number> {
  const db = await getDatabase();
  const voucherType = partyType === 'customer' ? 'receipt' : 'payment';
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(a.amount), 0) as total
     FROM payment_voucher_allocations a
     JOIN payment_vouchers v ON v.id = a.voucher_id
     WHERE v.party_name = ? COLLATE NOCASE
       AND v.party_type = ?
       AND v.voucher_type = ?
       AND a.bill_type IN ('advance', 'on_account', 'new_ref')
       AND a.sale_payment_id IS NULL
       AND a.purchase_payment_id IS NULL`,
    [partyName, partyType, voucherType]
  );
  return roundMoney(row?.total ?? 0);
}

type OpenAdvanceRow = {
  alloc_id: number;
  voucher_id: number;
  account_id: number | null;
  bill_name: string;
  bill_type: PaymentBillType;
  amount: number;
};

async function listOpenAdvanceAllocations(
  partyName: string,
  partyType: PartyType
): Promise<OpenAdvanceRow[]> {
  const db = await getDatabase();
  const voucherType = partyType === 'customer' ? 'receipt' : 'payment';
  return db.getAllAsync<OpenAdvanceRow>(
    `SELECT a.id as alloc_id, a.voucher_id, v.account_id, a.bill_name, a.bill_type, a.amount
     FROM payment_voucher_allocations a
     JOIN payment_vouchers v ON v.id = a.voucher_id
     WHERE v.party_name = ? COLLATE NOCASE
       AND v.party_type = ?
       AND v.voucher_type = ?
       AND a.bill_type IN ('advance', 'on_account', 'new_ref')
       AND a.sale_payment_id IS NULL
       AND a.purchase_payment_id IS NULL
     ORDER BY v.date ASC, a.id ASC`,
    [partyName.trim(), partyType, voucherType]
  );
}

/**
 * Apply party advance/on-account credit to a sale. Cash already moved on the
 * original receipt — this only links allocations and updates invoice paid.
 */
export async function applyPartyAdvanceToSale(
  saleId: number,
  amount: number,
  date: string
): Promise<number> {
  const applyAmount = roundMoney(Math.abs(amount));
  if (!(applyAmount > 0.009)) return 0;

  const db = await getDatabase();
  const sale = await db.getFirstAsync<{
    id: number;
    invoice_no: string;
    party_name: string;
    total_amount: number;
    paid_amount: number;
  }>('SELECT id, invoice_no, party_name, total_amount, paid_amount FROM sales WHERE id = ?', [
    saleId,
  ]);
  if (!sale) throw new Error('Sale not found');

  const due = roundMoney(Math.max(0, sale.total_amount - sale.paid_amount));
  const toApply = roundMoney(Math.min(applyAmount, due));
  if (!(toApply > 0.009)) return 0;

  const opens = await listOpenAdvanceAllocations(sale.party_name, 'customer');
  if (opens.length === 0) throw new Error('No advance credit available for this customer');

  let remaining = toApply;
  let applied = 0;
  const accountId =
    opens.find((o) => o.account_id)?.account_id ??
    (await ensureCashBankAccount('Cash'));

  await db.withTransactionAsync(async () => {
    for (const open of opens) {
      if (remaining <= 0.009) break;
      const slice = roundMoney(Math.min(remaining, open.amount));
      if (!(slice > 0.009)) continue;

      const payResult = await db.runAsync(
        `INSERT INTO sale_payments (sale_id, account_id, amount, date, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [saleId, accountId, slice, date, 'Advance applied']
      );
      const salePaymentId = payResult.lastInsertRowId;

      if (slice + 0.009 >= open.amount) {
        await db.runAsync(
          `UPDATE payment_voucher_allocations
           SET bill_type = 'agst_ref', bill_name = ?, sale_id = ?, sale_payment_id = ?
           WHERE id = ?`,
          [sale.invoice_no, saleId, salePaymentId, open.alloc_id]
        );
      } else {
        const leftover = roundMoney(open.amount - slice);
        await db.runAsync(
          `UPDATE payment_voucher_allocations SET amount = ? WHERE id = ?`,
          [leftover, open.alloc_id]
        );
        await db.runAsync(
          `INSERT INTO payment_voucher_allocations (
             voucher_id, bill_name, bill_type, amount,
             sale_id, purchase_id, sale_payment_id, purchase_payment_id
           ) VALUES (?, ?, 'agst_ref', ?, ?, NULL, ?, NULL)`,
          [open.voucher_id, sale.invoice_no, slice, saleId, salePaymentId]
        );
      }

      // No cash transaction — money already recorded on the advance receipt.
      remaining = roundMoney(remaining - slice);
      applied = roundMoney(applied + slice);
    }

    const sumRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ?`,
      [saleId]
    );
    const newPaid = roundMoney(sumRow?.total ?? 0);
    await db.runAsync('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?', [
      newPaid,
      getPaymentStatus(sale.total_amount, newPaid),
      saleId,
    ]);
  });

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // best-effort
  }

  return applied;
}

/**
 * Apply vendor advance/on-account credit to a purchase (mirror of sale apply).
 */
export async function applyPartyAdvanceToPurchase(
  purchaseId: number,
  amount: number,
  date: string
): Promise<number> {
  const applyAmount = roundMoney(Math.abs(amount));
  if (!(applyAmount > 0.009)) return 0;

  const db = await getDatabase();
  const purchase = await db.getFirstAsync<{
    id: number;
    invoice_no: string;
    supplier_name: string;
    total_amount: number;
    paid_amount: number;
  }>(
    'SELECT id, invoice_no, supplier_name, total_amount, paid_amount FROM purchases WHERE id = ?',
    [purchaseId]
  );
  if (!purchase) throw new Error('Purchase not found');

  const due = roundMoney(Math.max(0, purchase.total_amount - purchase.paid_amount));
  const toApply = roundMoney(Math.min(applyAmount, due));
  if (!(toApply > 0.009)) return 0;

  const opens = await listOpenAdvanceAllocations(purchase.supplier_name, 'vendor');
  if (opens.length === 0) throw new Error('No advance credit available for this vendor');

  let remaining = toApply;
  let applied = 0;
  const accountId =
    opens.find((o) => o.account_id)?.account_id ??
    (await ensureCashBankAccount('Cash'));

  await db.withTransactionAsync(async () => {
    for (const open of opens) {
      if (remaining <= 0.009) break;
      const slice = roundMoney(Math.min(remaining, open.amount));
      if (!(slice > 0.009)) continue;

      const payResult = await db.runAsync(
        `INSERT INTO purchase_payments (purchase_id, account_id, amount, date, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, accountId, slice, date, 'Advance applied']
      );
      const purchasePaymentId = payResult.lastInsertRowId;

      if (slice + 0.009 >= open.amount) {
        await db.runAsync(
          `UPDATE payment_voucher_allocations
           SET bill_type = 'agst_ref', bill_name = ?, purchase_id = ?, purchase_payment_id = ?
           WHERE id = ?`,
          [purchase.invoice_no, purchaseId, purchasePaymentId, open.alloc_id]
        );
      } else {
        const leftover = roundMoney(open.amount - slice);
        await db.runAsync(
          `UPDATE payment_voucher_allocations SET amount = ? WHERE id = ?`,
          [leftover, open.alloc_id]
        );
        await db.runAsync(
          `INSERT INTO payment_voucher_allocations (
             voucher_id, bill_name, bill_type, amount,
             sale_id, purchase_id, sale_payment_id, purchase_payment_id
           ) VALUES (?, ?, 'agst_ref', ?, NULL, ?, NULL, ?)`,
          [open.voucher_id, purchase.invoice_no, slice, purchaseId, purchasePaymentId]
        );
      }

      remaining = roundMoney(remaining - slice);
      applied = roundMoney(applied + slice);
    }

    const sumRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_payments WHERE purchase_id = ?`,
      [purchaseId]
    );
    const newPaid = roundMoney(sumRow?.total ?? 0);
    await db.runAsync('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?', [
      newPaid,
      getPaymentStatus(purchase.total_amount, newPaid),
      purchaseId,
    ]);
  });

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh();
  } catch {
    // best-effort
  }

  return applied;
}

/** Invoice-level payments not linked to a Payment voucher (legacy / sale screen). */
export async function getOrphanInvoicePayments(options?: {
  periodKey?: string;
  direction?: 'receipt' | 'payment' | 'all';
}): Promise<
  {
    id: string;
    voucher_type: PaymentVoucherType;
    voucher_no: string;
    date: string;
    party_name: string;
    amount: number;
    allocation_kind: 'against_invoice';
    ref_path: string;
  }[]
> {
  const db = await getDatabase();
  let start = '1970-01-01';
  let end = '9999-12-31';
  if (options?.periodKey) {
    const range = await resolvePeriodRange(options.periodKey);
    start = range.start;
    end = range.end;
  }
  const out: {
    id: string;
    voucher_type: PaymentVoucherType;
    voucher_no: string;
    date: string;
    party_name: string;
    amount: number;
    allocation_kind: 'against_invoice';
    ref_path: string;
  }[] = [];

  if (options?.direction !== 'payment') {
    const rows = await db.getAllAsync<{
      id: number;
      amount: number;
      date: string;
      invoice_no: string;
      party_name: string;
      sale_id: number;
    }>(
      `SELECT sp.id, sp.amount, sp.date, s.invoice_no, s.party_name, s.id as sale_id
       FROM sale_payments sp
       JOIN sales s ON s.id = sp.sale_id
       WHERE sp.date >= ? AND sp.date <= ?
         AND NOT EXISTS (
           SELECT 1 FROM payment_voucher_allocations a
           WHERE a.sale_payment_id = sp.id
         )
       ORDER BY sp.date DESC, sp.id DESC`,
      [start, end]
    );
    for (const row of rows) {
      out.push({
        id: `sale-pay-${row.id}`,
        voucher_type: 'receipt',
        voucher_no: row.invoice_no,
        date: row.date,
        party_name: row.party_name,
        amount: row.amount,
        allocation_kind: 'against_invoice',
        ref_path: `/(drawer)/sales/${row.sale_id}`,
      });
    }
  }

  if (options?.direction !== 'receipt') {
    const rows = await db.getAllAsync<{
      id: number;
      amount: number;
      date: string;
      invoice_no: string;
      supplier_name: string;
      purchase_id: number;
    }>(
      `SELECT pp.id, pp.amount, pp.date, p.invoice_no, p.supplier_name, p.id as purchase_id
       FROM purchase_payments pp
       JOIN purchases p ON p.id = pp.purchase_id
       WHERE pp.date >= ? AND pp.date <= ?
         AND NOT EXISTS (
           SELECT 1 FROM payment_voucher_allocations a
           WHERE a.purchase_payment_id = pp.id
         )
       ORDER BY pp.date DESC, pp.id DESC`,
      [start, end]
    );
    for (const row of rows) {
      out.push({
        id: `purchase-pay-${row.id}`,
        voucher_type: 'payment',
        voucher_no: row.invoice_no,
        date: row.date,
        party_name: row.supplier_name,
        amount: row.amount,
        allocation_kind: 'against_invoice',
        ref_path: `/(drawer)/purchases/${row.purchase_id}`,
      });
    }
  }

  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

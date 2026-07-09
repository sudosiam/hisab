import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import { shiftPeriod, periodKeyToLabel } from '../utils/date';
import { getPeriodFinancials } from './financials';
import { getBalanceSheet } from './banking';
import { getDayBookFromLedger, getTrialBalanceFromLedger, hasGeneralLedger } from './ledger';
import { subDays, parseISO, format } from 'date-fns';

export interface SalesReportRow {
  invoice_no: string;
  party_name: string;
  date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
}

export interface PurchaseReportRow {
  invoice_no: string;
  supplier_name: string;
  date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
}

export interface InventoryReportRow {
  name: string;
  sku: string | null;
  current_qty: number;
  avg_cost: number;
  sell_price: number;
  value: number;
}

export interface ProfitLossReport {
  revenue: number;
  cogs: number;
  grossProfit: number;
  otherIncome: number;
  expenses: number;
  netProfit: number;
}

export async function getSalesReport(periodKey: string): Promise<SalesReportRow[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);
  return db.getAllAsync<SalesReportRow>(
    `SELECT s.invoice_no, s.party_name, s.date, s.total_amount, s.paid_amount, s.status
     FROM sales s
     WHERE s.date >= ? AND s.date <= ?
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
     ORDER BY s.date DESC`,
    [start, end]
  );
}

export async function getPurchaseReport(periodKey: string): Promise<PurchaseReportRow[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);
  return db.getAllAsync<PurchaseReportRow>(
    `SELECT p.invoice_no, p.supplier_name, p.date, p.total_amount, p.paid_amount, p.status
     FROM purchases p
     WHERE p.date >= ? AND p.date <= ?
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
     ORDER BY p.date DESC`,
    [start, end]
  );
}

export async function getInventoryReport(): Promise<InventoryReportRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<InventoryReportRow>(
    `SELECT name, sku, current_qty, avg_cost, sell_price, (current_qty * avg_cost) as value
     FROM products WHERE COALESCE(is_hidden, 0) = 0 ORDER BY name ASC`
  );
}

export async function getProfitLossReport(periodKey: string): Promise<ProfitLossReport> {
  const financials = await getPeriodFinancials(periodKey);
  return {
    revenue: financials.revenue,
    cogs: financials.cogs,
    grossProfit: financials.grossProfit,
    otherIncome: financials.otherIncome,
    expenses: financials.expenses,
    netProfit: financials.netProfit,
  };
}

export interface ProfitLossComparison {
  current: ProfitLossReport;
  previous: ProfitLossReport;
  previousPeriodLabel: string;
  change: ProfitLossReport;
}

export async function getProfitLossComparisonReport(periodKey: string): Promise<ProfitLossComparison> {
  const previousKey = shiftPeriod(periodKey, -1);
  const [current, previous] = await Promise.all([
    getProfitLossReport(periodKey),
    getProfitLossReport(previousKey),
  ]);

  return {
    current,
    previous,
    previousPeriodLabel: periodKeyToLabel(previousKey),
    change: {
      revenue: roundMoney(current.revenue - previous.revenue),
      cogs: roundMoney(current.cogs - previous.cogs),
      grossProfit: roundMoney(current.grossProfit - previous.grossProfit),
      otherIncome: roundMoney(current.otherIncome - previous.otherIncome),
      expenses: roundMoney(current.expenses - previous.expenses),
      netProfit: roundMoney(current.netProfit - previous.netProfit),
    },
  };
}

export interface CashFlowReport {
  openingCash: number;
  closingCash: number;
  netChange: number;
  /** Operating + investing + financing; should match netChange when all cash flows are classified. */
  computedNetChange: number;
  operating: {
    customerReceipts: number;
    otherIncome: number;
    supplierPayments: number;
    expenses: number;
    net: number;
  };
  investing: {
    /** Fixed assets recorded this period (non-cash until paid from a bank/cash account). */
    fixedAssetsAdded: number;
    net: number;
  };
  financing: {
    deposits: number;
    withdrawals: number;
    net: number;
  };
}

async function getCashAtDate(endDate: string): Promise<number> {
  const db = await getDatabase();
  const { expectedAccountBalanceFromLedger } = await import('../db/database');
  const accounts = await db.getAllAsync<{ id: number; opening_balance: number }>(
    `SELECT id, opening_balance FROM accounts WHERE COALESCE(is_excluded, 0) = 0`
  );
  let total = 0;
  for (const account of accounts) {
    const row = await db.getFirstAsync<{ total: number; has_opening: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total,
              MAX(CASE WHEN type = 'opening' THEN 1 ELSE 0 END) AS has_opening
       FROM transactions
       WHERE account_id = ? AND date <= ?`,
      [account.id, endDate]
    );
    total += expectedAccountBalanceFromLedger(
      account.opening_balance,
      row?.total ?? 0,
      (row?.has_opening ?? 0) > 0
    );
  }
  return roundMoney(total);
}

export async function getCashFlowReport(periodKey: string): Promise<CashFlowReport> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);
  const openingDate = format(subDays(parseISO(start), 1), 'yyyy-MM-dd');

  const activeAccountSql = `t.account_id IN (SELECT id FROM accounts WHERE COALESCE(is_excluded, 0) = 0)`;

  const [byType, fixedAssets, openingCash, closingCash] = await Promise.all([
    db.getAllAsync<{ type: string; total: number }>(
      `SELECT t.type, COALESCE(SUM(t.amount), 0) as total
       FROM transactions t
       WHERE t.date >= ? AND t.date <= ? AND ${activeAccountSql}
         AND t.type NOT IN ('opening', 'transfer')
       GROUP BY t.type`,
      [start, end]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(value), 0) as total FROM fixed_assets
       WHERE date(created_at) >= ? AND date(created_at) <= ?`,
      [start, end]
    ),
    getCashAtDate(openingDate),
    getCashAtDate(end),
  ]);

  const sumType = (type: string) =>
    roundMoney(byType.find((row) => row.type === type)?.total ?? 0);

  const customerReceipts = Math.max(0, sumType('sale_payment'));
  const otherIncome = Math.max(0, sumType('other_income'));
  const supplierPayments = Math.abs(Math.min(0, sumType('purchase_payment')));
  const expenses = Math.abs(Math.min(0, sumType('expense')));
  const deposits = Math.max(0, sumType('deposit'));
  const withdrawals = Math.abs(Math.min(0, sumType('withdrawal')));

  const operatingNet = roundMoney(
    customerReceipts + otherIncome - supplierPayments - expenses
  );
  const fixedAssetsAdded = roundMoney(fixedAssets?.total ?? 0);
  // Fixed assets are balance-sheet memos until linked to a cash payment transaction.
  const investingNet = 0;
  const financingNet = roundMoney(deposits - withdrawals);
  const computedNetChange = roundMoney(operatingNet + investingNet + financingNet);

  return {
    openingCash,
    closingCash,
    netChange: roundMoney(closingCash - openingCash),
    computedNetChange,
    operating: {
      customerReceipts,
      otherIncome,
      supplierPayments,
      expenses,
      net: operatingNet,
    },
    investing: {
      fixedAssetsAdded,
      net: investingNet,
    },
    financing: {
      deposits,
      withdrawals,
      net: financingNet,
    },
  };
}

/** Sum report rows with the same rounding used in stored amounts. */
export function sumReportAmounts(rows: { total_amount: number }[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + row.total_amount, 0));
}

export async function getReceivablesReport(): Promise<
  { party_name: string; invoice_no: string; due: number; date: string }[]
> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT party_name, invoice_no, (total_amount - paid_amount) as due, date
     FROM sales
     WHERE total_amount - paid_amount > 0.01
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = sales.id)
     ORDER BY date DESC`
  );
}

export async function getPayablesReport(): Promise<
  { supplier_name: string; invoice_no: string; due: number; date: string }[]
> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT supplier_name, invoice_no, (total_amount - paid_amount) as due, date
     FROM purchases
     WHERE total_amount - paid_amount > 0.01
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = purchases.id)
     ORDER BY date DESC`
  );
}

export interface ExpenseCategoryRow {
  category: string;
  total: number;
  count: number;
}

export async function getExpensesByCategoryReport(periodKey: string): Promise<ExpenseCategoryRow[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);
  const rows = await db.getAllAsync<{ category: string; total: number; count: number }>(
    `SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM expenses
     WHERE date >= ? AND date <= ?
     GROUP BY category
     ORDER BY total DESC, category ASC`,
    [start, end]
  );
  return rows.map((row) => ({
    category: row.category,
    total: roundMoney(row.total),
    count: row.count,
  }));
}

export interface DayBookEntry {
  id: string;
  date: string;
  voucherType: string;
  voucherNo: string;
  particulars: string;
  debit: number;
  credit: number;
}

export async function getDayBookReport(startDate: string, endDate: string): Promise<DayBookEntry[]> {
  if (await hasGeneralLedger()) {
    const lines = await getDayBookFromLedger(startDate, endDate);
    return lines.map((line) => ({
      id: line.id,
      date: line.date,
      voucherType: 'Journal',
      voucherNo: line.reference_id ? String(line.reference_id) : '—',
      particulars: line.description,
      debit: line.debit,
      credit: line.credit,
    }));
  }

  const db = await getDatabase();
  const entries: Omit<DayBookEntry, 'id'>[] = [];

  const sales = await db.getAllAsync<{
    id: number;
    invoice_no: string;
    party_name: string;
    date: string;
    total_amount: number;
  }>(
    `SELECT s.id, s.invoice_no, s.party_name, s.date, s.total_amount
     FROM sales s
     WHERE s.date >= ? AND s.date <= ?
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
     ORDER BY s.date ASC, s.id ASC`,
    [startDate, endDate]
  );
  for (const sale of sales) {
    entries.push({
      date: sale.date,
      voucherType: 'Sales',
      voucherNo: sale.invoice_no,
      particulars: sale.party_name,
      debit: roundMoney(sale.total_amount),
      credit: 0,
    });
  }

  const purchases = await db.getAllAsync<{
    id: number;
    invoice_no: string;
    supplier_name: string;
    date: string;
    total_amount: number;
  }>(
    `SELECT p.id, p.invoice_no, p.supplier_name, p.date, p.total_amount
     FROM purchases p
     WHERE p.date >= ? AND p.date <= ?
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
     ORDER BY p.date ASC, p.id ASC`,
    [startDate, endDate]
  );
  for (const purchase of purchases) {
    entries.push({
      date: purchase.date,
      voucherType: 'Purchase',
      voucherNo: purchase.invoice_no,
      particulars: purchase.supplier_name,
      debit: 0,
      credit: roundMoney(purchase.total_amount),
    });
  }

  const expenses = await db.getAllAsync<{
    id: number;
    category: string;
    date: string;
    amount: number;
  }>(
    `SELECT id, category, date, amount FROM expenses
     WHERE date >= ? AND date <= ?
     ORDER BY date ASC, id ASC`,
    [startDate, endDate]
  );
  for (const expense of expenses) {
    entries.push({
      date: expense.date,
      voucherType: 'Expense',
      voucherNo: String(expense.id),
      particulars: expense.category,
      debit: 0,
      credit: roundMoney(expense.amount),
    });
  }

  const otherIncome = await db.getAllAsync<{
    id: number;
    description: string;
    date: string;
    amount: number;
  }>(
    `SELECT id, description, date, amount FROM other_income
     WHERE date >= ? AND date <= ?
     ORDER BY date ASC, id ASC`,
    [startDate, endDate]
  );
  for (const row of otherIncome) {
    entries.push({
      date: row.date,
      voucherType: 'Other Income',
      voucherNo: String(row.id),
      particulars: row.description,
      debit: roundMoney(row.amount),
      credit: 0,
    });
  }

  entries.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.voucherType.localeCompare(b.voucherType);
  });

  return entries.map((entry, index) => ({
    ...entry,
    id: `${entry.voucherType}-${entry.voucherNo}-${index}`,
  }));
}

export interface TrialBalanceRow {
  account: string;
  debit: number;
  credit: number;
}

/** Snapshot trial balance derived from the general ledger (double-entry). */
export async function getTrialBalanceReport(): Promise<{
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}> {
  if (await hasGeneralLedger()) {
    return getTrialBalanceFromLedger();
  }

  const sheet = await getBalanceSheet();
  const rows: TrialBalanceRow[] = [
    { account: 'Cash & Bank', debit: sheet.assets.cashAndBank, credit: 0 },
    { account: 'Receivables', debit: sheet.assets.receivables, credit: 0 },
    { account: 'Inventory', debit: sheet.assets.inventory, credit: 0 },
    { account: 'Fixed Assets', debit: sheet.assets.fixedAssets, credit: 0 },
    { account: 'Payables', debit: 0, credit: sheet.liabilities.payables },
    { account: 'Loans', debit: 0, credit: sheet.liabilities.loans },
    { account: 'Owner\'s Equity', debit: 0, credit: Math.max(0, sheet.equity) },
  ].filter((row) => row.debit > 0.009 || row.credit > 0.009);

  if (sheet.equity < -0.009) {
    rows.push({ account: 'Accumulated Loss', debit: Math.abs(sheet.equity), credit: 0 });
  }

  const totalDebit = roundMoney(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = roundMoney(rows.reduce((sum, row) => sum + row.credit, 0));
  return { rows, totalDebit, totalCredit };
}

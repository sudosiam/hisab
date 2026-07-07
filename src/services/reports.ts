import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import { getPeriodFinancials } from './financials';

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

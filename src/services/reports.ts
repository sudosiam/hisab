import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';

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
    `SELECT invoice_no, party_name, date, total_amount, paid_amount, status
     FROM sales WHERE date >= ? AND date <= ?
     ORDER BY date DESC`,
    [start, end]
  );
}

export async function getPurchaseReport(periodKey: string): Promise<PurchaseReportRow[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);
  return db.getAllAsync<PurchaseReportRow>(
    `SELECT invoice_no, supplier_name, date, total_amount, paid_amount, status
     FROM purchases WHERE date >= ? AND date <= ?
     ORDER BY date DESC`,
    [start, end]
  );
}

export async function getInventoryReport(): Promise<InventoryReportRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<InventoryReportRow>(
    `SELECT name, sku, current_qty, avg_cost, sell_price, (current_qty * avg_cost) as value
     FROM products ORDER BY name ASC`
  );
}

export async function getProfitLossReport(periodKey: string): Promise<ProfitLossReport> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const revenue = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE date >= ? AND date <= ?`,
    [start, end]
  );

  const cogs = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(
       si.unit_cost * si.qty *
       CASE WHEN s.subtotal > 0 THEN (s.subtotal - s.discount_amount) / s.subtotal ELSE 1 END
     ), 0) as total
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.date >= ? AND s.date <= ?`,
    [start, end]
  );

  const expenses = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= ? AND date <= ?`,
    [start, end]
  );

  const otherIncome = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(oi.amount), 0) as total FROM other_income oi
     JOIN accounts a ON a.id = oi.account_id
     WHERE oi.date >= ? AND oi.date <= ? AND COALESCE(a.is_excluded, 0) = 0`,
    [start, end]
  );

  const rev = roundMoney(revenue?.total ?? 0);
  const cost = roundMoney(cogs?.total ?? 0);
  const exp = roundMoney(expenses?.total ?? 0);
  const other = roundMoney(otherIncome?.total ?? 0);
  const gross = roundMoney(rev - cost);

  return {
    revenue: rev,
    cogs: cost,
    grossProfit: gross,
    otherIncome: other,
    expenses: exp,
    netProfit: roundMoney(gross + other - exp),
  };
}

export async function getReceivablesReport(): Promise<
  { party_name: string; invoice_no: string; due: number; date: string }[]
> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT party_name, invoice_no, (total_amount - paid_amount) as due, date
     FROM sales WHERE paid_amount < total_amount ORDER BY date DESC`
  );
}

export async function getPayablesReport(): Promise<
  { supplier_name: string; invoice_no: string; due: number; date: string }[]
> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT supplier_name, invoice_no, (total_amount - paid_amount) as due, date
     FROM purchases WHERE paid_amount < total_amount ORDER BY date DESC`
  );
}

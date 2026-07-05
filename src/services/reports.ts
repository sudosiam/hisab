import { getDatabase } from '../db/database';
import { getMonthRange } from '../utils/date';

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
  expenses: number;
  netProfit: number;
}

export async function getSalesReport(monthKey: string): Promise<SalesReportRow[]> {
  const db = await getDatabase();
  const { start, end } = getMonthRange(monthKey);
  return db.getAllAsync<SalesReportRow>(
    `SELECT invoice_no, party_name, date, total_amount, paid_amount, status
     FROM sales WHERE date >= ? AND date <= ?
     ORDER BY date DESC`,
    [start, end]
  );
}

export async function getPurchaseReport(monthKey: string): Promise<PurchaseReportRow[]> {
  const db = await getDatabase();
  const { start, end } = getMonthRange(monthKey);
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

export async function getProfitLossReport(monthKey: string): Promise<ProfitLossReport> {
  const db = await getDatabase();
  const { start, end } = getMonthRange(monthKey);

  const revenue = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE date >= ? AND date <= ?`,
    [start, end]
  );

  const cogs = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(si.unit_cost * si.qty), 0) as total
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.date >= ? AND s.date <= ?`,
    [start, end]
  );

  const expenses = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= ? AND date <= ?`,
    [start, end]
  );

  const rev = revenue?.total ?? 0;
  const cost = cogs?.total ?? 0;
  const exp = expenses?.total ?? 0;
  const gross = rev - cost;

  return {
    revenue: rev,
    cogs: cost,
    grossProfit: gross,
    expenses: exp,
    netProfit: gross - exp,
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

import { getDatabase } from '../db/database';
import { getInventoryValue } from './inventory';
import { getMonthRange } from '../utils/date';
import type { DashboardStats } from '../types';

export async function getDashboardStats(monthKey: string): Promise<DashboardStats> {
  const db = await getDatabase();
  const { start, end } = getMonthRange(monthKey);

  const sold = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE date >= ? AND date <= ?`,
    [start, end]
  );

  const purchased = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases WHERE date >= ? AND date <= ?`,
    [start, end]
  );

  const grossProfit = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM((si.unit_price - si.unit_cost) * si.qty), 0) as total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.date >= ? AND s.date <= ?`,
    [start, end]
  );

  const expense = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= ? AND date <= ?`,
    [start, end]
  );

  const liquid = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts`
  );

  const receivable = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total FROM sales WHERE paid_amount < total_amount`
  );

  const inventoryValue = await getInventoryValue();

  const gross = grossProfit?.total ?? 0;
  const exp = expense?.total ?? 0;

  return {
    sold: sold?.total ?? 0,
    purchased: purchased?.total ?? 0,
    grossProfit: gross,
    netProfit: gross - exp,
    expense: exp,
    totalLiquid: liquid?.total ?? 0,
    receivable: receivable?.total ?? 0,
    inventoryValue,
  };
}

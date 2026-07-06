import { getDatabase } from '../db/database';
import { getInventoryValue } from './inventory';
import { getPeriodFinancials } from './financials';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import type { DashboardStats } from '../types';

export async function getDashboardStats(periodKey: string): Promise<DashboardStats> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const [financials, purchased, liquid, receivable, inventoryValue] = await Promise.all([
    getPeriodFinancials(periodKey, { start, end }),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(p.total_amount), 0) as total
       FROM purchases p
       WHERE p.date >= ? AND p.date <= ?
         AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)`,
      [start, end]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE COALESCE(is_excluded, 0) = 0`
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total FROM sales WHERE paid_amount < total_amount`
    ),
    getInventoryValue(),
  ]);

  return {
    sold: financials.revenue,
    purchased: roundMoney(purchased?.total ?? 0),
    grossProfit: financials.grossProfit,
    otherIncome: financials.otherIncome,
    netProfit: financials.netProfit,
    expense: financials.expenses,
    totalLiquid: roundMoney(liquid?.total ?? 0),
    receivable: roundMoney(receivable?.total ?? 0),
    inventoryValue: roundMoney(inventoryValue),
  };
}

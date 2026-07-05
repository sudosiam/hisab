import { getDatabase } from '../db/database';
import { getInventoryValue } from './inventory';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import type { DashboardStats } from '../types';

export async function getDashboardStats(periodKey: string): Promise<DashboardStats> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const [
    sold,
    purchased,
    grossProfit,
    serviceCharges,
    expense,
    otherIncome,
    liquid,
    receivable,
    inventoryValue,
  ] = await Promise.all([
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE date >= ? AND date <= ?`,
      [start, end]
    ),
    // Accrual basis by purchase date — matches how `sold` is computed.
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases WHERE date >= ? AND date <= ?`,
      [start, end]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(
         (si.unit_price - si.unit_cost) * si.qty *
         CASE WHEN s.subtotal > 0 THEN (s.subtotal - s.discount_amount) / s.subtotal ELSE 1 END
       ), 0) as total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.date >= ? AND s.date <= ?`,
      [start, end]
    ),
    // Service charges are pure margin (no COGS) and belong in gross profit.
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(service_charges), 0) as total FROM sales WHERE date >= ? AND date <= ?`,
      [start, end]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= ? AND date <= ?`,
      [start, end]
    ),
    // Match otherIncome service semantics: excluded accounts stay out.
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(oi.amount), 0) as total FROM other_income oi
       JOIN accounts a ON a.id = oi.account_id
       WHERE oi.date >= ? AND oi.date <= ? AND COALESCE(a.is_excluded, 0) = 0`,
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

  const gross = roundMoney((grossProfit?.total ?? 0) + (serviceCharges?.total ?? 0));
  const exp = roundMoney(expense?.total ?? 0);
  const other = roundMoney(otherIncome?.total ?? 0);

  return {
    sold: roundMoney(sold?.total ?? 0),
    purchased: roundMoney(purchased?.total ?? 0),
    grossProfit: gross,
    otherIncome: other,
    netProfit: roundMoney(gross + other - exp),
    expense: exp,
    totalLiquid: roundMoney(liquid?.total ?? 0),
    receivable: roundMoney(receivable?.total ?? 0),
    inventoryValue: roundMoney(inventoryValue),
  };
}

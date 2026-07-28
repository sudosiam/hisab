import { getDatabase } from '../db/database';
import { getInventoryValue } from './inventory';
import { getPeriodFinancials, type AccountingBasis, SALE_LINE_UNIT_COST_SQL } from './financials';
import { getBalanceSheet } from './banking';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import {
  getMonthRange,
  isAllPeriodKey,
  isFinancialYearPeriodKey,
  monthKeyToLabel,
} from '../utils/date';
import { eachDayOfInterval, format, parse } from 'date-fns';
import type { DashboardStats } from '../types';

export type { AccountingBasis };

export interface DashboardDayTrend {
  date: string;
  /** Day-of-month label, e.g. "1", "12". */
  shortLabel: string;
  sales: number;
  purchases: number;
  expenses: number;
  netProfit: number;
}

export interface DashboardDailyTrend {
  /** False when period is FY / all — chart needs a single month. */
  available: boolean;
  periodLabel: string;
  days: DashboardDayTrend[];
}

function totalsByDay(rows: { day: string; total: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.day, roundMoney(row.total ?? 0));
  }
  return map;
}

function daysInMonthKey(monthKey: string): string[] {
  const { start, end } = getMonthRange(monthKey);
  return eachDayOfInterval({
    start: parse(start, 'yyyy-MM-dd', new Date()),
    end: parse(end, 'yyyy-MM-dd', new Date()),
  }).map((d) => format(d, 'yyyy-MM-dd'));
}

/** Daily Sales / Purchases / Expenses / Profit for the selected calendar month. */
export async function getDashboardDailyTrend(
  periodKey: string,
  basis: AccountingBasis = 'accrual'
): Promise<DashboardDailyTrend> {
  if (isAllPeriodKey(periodKey) || isFinancialYearPeriodKey(periodKey)) {
    return {
      available: false,
      periodLabel: isAllPeriodKey(periodKey) ? 'All time' : 'Financial year',
      days: [],
    };
  }

  const monthKey = periodKey;
  const days = daysInMonthKey(monthKey);
  const { start, end } = getMonthRange(monthKey);
  const db = await getDatabase();

  const salesSql =
    basis === 'cash'
      ? `SELECT sp.date as day, COALESCE(SUM(sp.amount), 0) as total
         FROM sale_payments sp
         JOIN accounts a ON a.id = sp.account_id
         WHERE sp.date >= ? AND sp.date <= ?
           AND COALESCE(a.is_excluded, 0) = 0
         GROUP BY sp.date`
      : `SELECT s.date as day, COALESCE(SUM(s.total_amount), 0) as total
         FROM sales s
         WHERE s.date >= ? AND s.date <= ?
           AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
         GROUP BY s.date`;

  const purchasesSql =
    basis === 'cash'
      ? `SELECT pp.date as day, COALESCE(SUM(pp.amount), 0) as total
         FROM purchase_payments pp
         JOIN accounts a ON a.id = pp.account_id
         WHERE pp.date >= ? AND pp.date <= ?
           AND COALESCE(a.is_excluded, 0) = 0
         GROUP BY pp.date`
      : `SELECT p.date as day, COALESCE(SUM(p.total_amount), 0) as total
         FROM purchases p
         WHERE p.date >= ? AND p.date <= ?
           AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
         GROUP BY p.date`;

  // Cash profit must match getPeriodFinancials: cash in − payment-prorated COGS − exp + other.
  // Accrual uses sale-date COGS. Do not use purchase payments as a COGS substitute.
  const cogsSql =
    basis === 'cash'
      ? `SELECT sp.date as day, COALESCE(SUM(
           (
             SELECT COALESCE(SUM(${SALE_LINE_UNIT_COST_SQL} * si.qty), 0)
             FROM sale_items si
             JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = s.id
           ) * (sp.amount / NULLIF(s.total_amount, 0))
         ), 0) as total
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         JOIN accounts a ON a.id = sp.account_id
         WHERE sp.date >= ? AND sp.date <= ?
           AND COALESCE(a.is_excluded, 0) = 0
           AND s.total_amount > 0
         GROUP BY sp.date`
      : `SELECT s.date as day, COALESCE(SUM(
           ${SALE_LINE_UNIT_COST_SQL} * si.qty
         ), 0) as total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.date >= ? AND s.date <= ?
         GROUP BY s.date`;

  const [salesRows, purchaseRows, expenseRows, cogsRows, otherRows] = await Promise.all([
    db.getAllAsync<{ day: string; total: number }>(salesSql, [start, end]),
    db.getAllAsync<{ day: string; total: number }>(purchasesSql, [start, end]),
    db.getAllAsync<{ day: string; total: number }>(
      `SELECT e.date as day, COALESCE(SUM(e.amount), 0) as total
       FROM expenses e
       JOIN accounts a ON a.id = e.account_id
       WHERE e.date >= ? AND e.date <= ? AND COALESCE(a.is_excluded, 0) = 0
       GROUP BY e.date`,
      [start, end]
    ),
    db.getAllAsync<{ day: string; total: number }>(cogsSql, [start, end]),
    db.getAllAsync<{ day: string; total: number }>(
      `SELECT oi.date as day, COALESCE(SUM(oi.amount), 0) as total
       FROM other_income oi
       JOIN accounts a ON a.id = oi.account_id
       WHERE oi.date >= ? AND oi.date <= ? AND COALESCE(a.is_excluded, 0) = 0
       GROUP BY oi.date`,
      [start, end]
    ),
  ]);

  const salesMap = totalsByDay(salesRows);
  const purchaseMap = totalsByDay(purchaseRows);
  const expenseMap = totalsByDay(expenseRows);
  const cogsMap = totalsByDay(cogsRows);
  const otherMap = totalsByDay(otherRows);

  const dayRows: DashboardDayTrend[] = days.map((date) => {
    const sales = salesMap.get(date) ?? 0;
    const purchases = purchaseMap.get(date) ?? 0;
    const expenses = expenseMap.get(date) ?? 0;
    const cogs = cogsMap.get(date) ?? 0;
    const otherIncome = otherMap.get(date) ?? 0;
    const netProfit = roundMoney(sales - cogs - expenses + otherIncome);

    return {
      date,
      shortLabel: String(parseInt(date.slice(8, 10), 10)),
      sales,
      purchases,
      expenses,
      netProfit,
    };
  });

  return {
    available: true,
    periodLabel: monthKeyToLabel(monthKey),
    days: dayRows,
  };
}

export async function getDashboardStats(
  periodKey: string,
  basis: AccountingBasis = 'accrual'
): Promise<DashboardStats> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const [financials, purchased, liquid, receivable, payable, inventoryValue, balanceSheet] =
    await Promise.all([
      getPeriodFinancials(periodKey, { start, end }, basis),
      basis === 'cash'
        ? db.getFirstAsync<{ total: number }>(
            `SELECT COALESCE(SUM(pp.amount), 0) as total
             FROM purchase_payments pp
             JOIN accounts a ON a.id = pp.account_id
             WHERE pp.date >= ? AND pp.date <= ?
               AND COALESCE(a.is_excluded, 0) = 0`,
            [start, end]
          )
        : db.getFirstAsync<{ total: number }>(
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
        `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
         FROM sales
         WHERE total_amount - paid_amount > 0
           AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = sales.id)`
      ),
      db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
         FROM purchases
         WHERE total_amount - paid_amount > 0
           AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = purchases.id)`
      ),
      getInventoryValue(),
      getBalanceSheet(),
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
    payable: roundMoney(payable?.total ?? 0),
    inventoryValue: roundMoney(inventoryValue),
    netWorth: balanceSheet.equity,
  };
}

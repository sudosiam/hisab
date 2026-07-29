import { getDatabase } from '../db/database';
import { getInventoryValue } from './inventory';
import { getPeriodFinancials, type AccountingBasis, SALE_LINE_UNIT_COST_SQL } from './financials';
import { getBalanceSheet } from './banking';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import { getFinancialYearStartMonth } from './appSettings';
import {
  fiscalMonthShortLabel,
  formatFinancialYearShortLabel,
  getCurrentMonthKey,
  getFiscalYearMonthKeysForStartYear,
  getMonthRange,
  isAllPeriodKey,
  isFinancialYearPeriodKey,
  monthKeyToLabel,
  parseFinancialYearPeriodKey,
  shiftMonth,
} from '../utils/date';
import { eachDayOfInterval, format, parse } from 'date-fns';
import type { DashboardStats } from '../types';

export type { AccountingBasis };

export type DashboardTrendGranularity = 'day' | 'month';

export interface DashboardDayTrend {
  /** ISO date (day) or yyyy-MM (month). */
  date: string;
  /** Day-of-month or month short label. */
  shortLabel: string;
  sales: number;
  purchases: number;
  expenses: number;
  netProfit: number;
}

/** @deprecated Prefer DashboardTrend — alias kept for callers. */
export type DashboardDailyTrend = DashboardTrend;

export interface DashboardTrend {
  available: boolean;
  granularity: DashboardTrendGranularity;
  periodLabel: string;
  days: DashboardDayTrend[];
}

function totalsByKey(rows: { key: string; total: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.key, roundMoney(row.total ?? 0));
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

function lastTwelveCalendarMonthKeys(asOfKey = getCurrentMonthKey()): string[] {
  const keys: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    keys.push(shiftMonth(asOfKey, -i));
  }
  return keys;
}

async function loadTrendPointsForRange(
  keys: string[],
  keyExpr: 'day' | 'month',
  start: string,
  end: string,
  basis: AccountingBasis
): Promise<DashboardDayTrend[]> {
  const db = await getDatabase();
  const selectKey =
    keyExpr === 'day'
      ? (tableAlias: string, dateCol: string) => `${tableAlias}.${dateCol} as key`
      : (tableAlias: string, dateCol: string) => `substr(${tableAlias}.${dateCol}, 1, 7) as key`;

  const salesSql =
    basis === 'cash'
      ? `SELECT ${selectKey('sp', 'date')}, COALESCE(SUM(sp.amount), 0) as total
         FROM sale_payments sp
         JOIN accounts a ON a.id = sp.account_id
         WHERE sp.date >= ? AND sp.date <= ?
           AND COALESCE(a.is_excluded, 0) = 0
         GROUP BY key`
      : `SELECT ${selectKey('s', 'date')}, COALESCE(SUM(s.total_amount), 0) as total
         FROM sales s
         WHERE s.date >= ? AND s.date <= ?
           AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
         GROUP BY key`;

  const purchasesSql =
    basis === 'cash'
      ? `SELECT ${selectKey('pp', 'date')}, COALESCE(SUM(pp.amount), 0) as total
         FROM purchase_payments pp
         JOIN accounts a ON a.id = pp.account_id
         WHERE pp.date >= ? AND pp.date <= ?
           AND COALESCE(a.is_excluded, 0) = 0
         GROUP BY key`
      : `SELECT ${selectKey('p', 'date')}, COALESCE(SUM(p.total_amount), 0) as total
         FROM purchases p
         WHERE p.date >= ? AND p.date <= ?
           AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
         GROUP BY key`;

  const cogsSql =
    basis === 'cash'
      ? `SELECT ${selectKey('sp', 'date')}, COALESCE(SUM(
           (
             SELECT COALESCE(SUM(${SALE_LINE_UNIT_COST_SQL} * si.qty), 0)
             FROM sale_items si
             JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = s.id
           ) * (sp.amount * 1.0 / NULLIF(s.total_amount, 0))
         ), 0) as total
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         JOIN accounts a ON a.id = sp.account_id
         WHERE sp.date >= ? AND sp.date <= ?
           AND COALESCE(a.is_excluded, 0) = 0
           AND s.total_amount > 0
         GROUP BY key`
      : `SELECT substr(s.date, 1, ${keyExpr === 'day' ? 10 : 7}) as key, COALESCE(SUM(
           ${SALE_LINE_UNIT_COST_SQL} * si.qty
         ), 0) as total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.date >= ? AND s.date <= ?
         GROUP BY key`;

  const [salesRows, purchaseRows, expenseRows, cogsRows, otherRows] = await Promise.all([
    db.getAllAsync<{ key: string; total: number }>(salesSql, [start, end]),
    db.getAllAsync<{ key: string; total: number }>(purchasesSql, [start, end]),
    db.getAllAsync<{ key: string; total: number }>(
      `SELECT ${selectKey('e', 'date')}, COALESCE(SUM(e.amount), 0) as total
       FROM expenses e
       JOIN accounts a ON a.id = e.account_id
       WHERE e.date >= ? AND e.date <= ? AND COALESCE(a.is_excluded, 0) = 0
       GROUP BY key`,
      [start, end]
    ),
    db.getAllAsync<{ key: string; total: number }>(cogsSql, [start, end]),
    db.getAllAsync<{ key: string; total: number }>(
      `SELECT ${selectKey('oi', 'date')}, COALESCE(SUM(oi.amount), 0) as total
       FROM other_income oi
       JOIN accounts a ON a.id = oi.account_id
       WHERE oi.date >= ? AND oi.date <= ? AND COALESCE(a.is_excluded, 0) = 0
       GROUP BY key`,
      [start, end]
    ),
  ]);

  const salesMap = totalsByKey(salesRows);
  const purchaseMap = totalsByKey(purchaseRows);
  const expenseMap = totalsByKey(expenseRows);
  const cogsMap = totalsByKey(cogsRows);
  const otherMap = totalsByKey(otherRows);

  return keys.map((key) => {
    const sales = salesMap.get(key) ?? 0;
    const purchases = purchaseMap.get(key) ?? 0;
    const expenses = expenseMap.get(key) ?? 0;
    const cogs = cogsMap.get(key) ?? 0;
    const otherIncome = otherMap.get(key) ?? 0;
    const netProfit = roundMoney(sales - cogs - expenses + otherIncome);
    const shortLabel =
      keyExpr === 'day'
        ? String(parseInt(key.slice(8, 10), 10))
        : fiscalMonthShortLabel(key);

    return {
      date: key,
      shortLabel,
      sales,
      purchases,
      expenses,
      netProfit,
    };
  });
}

/** Sales / Purchases / Expenses / Profit trend for the selected period. */
export async function getDashboardDailyTrend(
  periodKey: string,
  basis: AccountingBasis = 'accrual'
): Promise<DashboardTrend> {
  return getDashboardTrend(periodKey, basis);
}

export async function getDashboardTrend(
  periodKey: string,
  basis: AccountingBasis = 'accrual'
): Promise<DashboardTrend> {
  if (isAllPeriodKey(periodKey)) {
    const monthKeys = lastTwelveCalendarMonthKeys();
    const { start } = getMonthRange(monthKeys[0]);
    const { end } = getMonthRange(monthKeys[monthKeys.length - 1]);
    const days = await loadTrendPointsForRange(monthKeys, 'month', start, end, basis);
    return {
      available: true,
      granularity: 'month',
      periodLabel: 'Last 12 months',
      days,
    };
  }

  if (isFinancialYearPeriodKey(periodKey)) {
    const fyStartYear = parseFinancialYearPeriodKey(periodKey);
    if (fyStartYear == null) {
      return { available: false, granularity: 'month', periodLabel: 'Financial year', days: [] };
    }
    const fyStartMonth = await getFinancialYearStartMonth();
    const monthKeys = getFiscalYearMonthKeysForStartYear(fyStartYear, fyStartMonth);
    const { start } = getMonthRange(monthKeys[0]);
    const { end } = getMonthRange(monthKeys[monthKeys.length - 1]);
    const days = await loadTrendPointsForRange(monthKeys, 'month', start, end, basis);
    return {
      available: true,
      granularity: 'month',
      periodLabel: `FY ${formatFinancialYearShortLabel(fyStartYear)}`,
      days,
    };
  }

  const monthKey = periodKey;
  const dayKeys = daysInMonthKey(monthKey);
  const { start, end } = getMonthRange(monthKey);
  const days = await loadTrendPointsForRange(dayKeys, 'day', start, end, basis);

  return {
    available: true,
    granularity: 'day',
    periodLabel: monthKeyToLabel(monthKey),
    days,
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

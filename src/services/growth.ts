import { getDatabase } from '../db/database';
import { getBalanceSheet } from './banking';
import { getOwnerInvestment } from './investments';
import { getFinancialYearStartMonth, getSelectedFinancialYearStartYear } from './appSettings';
import {
  fiscalMonthLongLabel,
  fiscalMonthShortLabel,
  formatFinancialYearShortLabel,
  getFiscalYearMonthKeysForStartYear,
  getMonthRange,
} from '../utils/date';
import { addMoney, roundMoney, subMoney } from '../utils/money';
import { SALE_LINE_UNIT_COST_SQL } from './financials';

export interface GrowthSnapshot {
  netWorth: number;
  totalAssets: number;
  liabilities: number;
  ownerInvestment: number;
  aheadBehind: number;
  returnOnInvestment: number;
  cashAndBank: number;
  inventory: number;
  receivables: number;
  fixedAssets: number;
  excludedAccountsBalance: number;
}

export interface GrowthMonthRow {
  monthKey: string;
  label: string;
  shortLabel: string;
  netProfit: number;
  revenue: number;
  cogs: number;
  operatingExpenses: number;
  otherIncome: number;
  cumulativeSurplus: number;
  hasActivity: boolean;
}

export interface GrowthReport {
  snapshot: GrowthSnapshot;
  months: GrowthMonthRow[];
  financialYearRangeLabel: string;
}

function totalsByMonth(rows: { month_key: string; total: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.month_key, roundMoney(row.total ?? 0));
  }
  return map;
}

async function getFiscalYearFinancialsByMonth(
  monthKeys: string[]
): Promise<
  Map<
    string,
    {
      revenue: number;
      cogs: number;
      operatingExpenses: number;
      otherIncome: number;
      netProfit: number;
    }
  >
> {
  const result = new Map<
    string,
    {
      revenue: number;
      cogs: number;
      operatingExpenses: number;
      otherIncome: number;
      netProfit: number;
    }
  >();

  if (monthKeys.length === 0) return result;

  const db = await getDatabase();
  const fyStart = getMonthRange(monthKeys[0]).start;
  const fyEnd = getMonthRange(monthKeys[monthKeys.length - 1]).end;

  const [revenueRows, cogsRows, expenseRows, otherRows] = await Promise.all([
    db.getAllAsync<{ month_key: string; total: number }>(
      `SELECT substr(s.date, 1, 7) as month_key, COALESCE(SUM(s.total_amount), 0) as total
       FROM sales s
       WHERE s.date >= ? AND s.date <= ?
         AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
       GROUP BY month_key`,
      [fyStart, fyEnd]
    ),
    db.getAllAsync<{ month_key: string; total: number }>(
      `SELECT substr(s.date, 1, 7) as month_key, COALESCE(SUM(
         ${SALE_LINE_UNIT_COST_SQL} * si.qty
       ), 0) as total
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.date >= ? AND s.date <= ?
       GROUP BY month_key`,
      [fyStart, fyEnd]
    ),
    db.getAllAsync<{ month_key: string; total: number }>(
      `SELECT substr(date, 1, 7) as month_key, COALESCE(SUM(amount), 0) as total
       FROM expenses WHERE date >= ? AND date <= ?
       GROUP BY month_key`,
      [fyStart, fyEnd]
    ),
    db.getAllAsync<{ month_key: string; total: number }>(
      `SELECT substr(oi.date, 1, 7) as month_key, COALESCE(SUM(oi.amount), 0) as total
       FROM other_income oi
       JOIN accounts a ON a.id = oi.account_id
       WHERE oi.date >= ? AND oi.date <= ? AND COALESCE(a.is_excluded, 0) = 0
       GROUP BY month_key`,
      [fyStart, fyEnd]
    ),
  ]);

  const revenueMap = totalsByMonth(revenueRows);
  const cogsMap = totalsByMonth(cogsRows);
  const expenseMap = totalsByMonth(expenseRows);
  const otherMap = totalsByMonth(otherRows);

  for (const monthKey of monthKeys) {
    const revenue = revenueMap.get(monthKey) ?? 0;
    const cogs = cogsMap.get(monthKey) ?? 0;
    const operatingExpenses = expenseMap.get(monthKey) ?? 0;
    const otherIncome = otherMap.get(monthKey) ?? 0;
    result.set(monthKey, {
      revenue,
      cogs,
      operatingExpenses,
      otherIncome,
      netProfit: roundMoney(revenue - cogs - operatingExpenses + otherIncome),
    });
  }

  return result;
}

export async function getGrowthReport(asOf: Date = new Date()): Promise<GrowthReport> {
  const db = await getDatabase();
  const [balanceSheet, ownerInvestment, fyStartMonth, fyStartYear] = await Promise.all([
    getBalanceSheet(),
    getOwnerInvestment(),
    getFinancialYearStartMonth(),
    getSelectedFinancialYearStartYear(),
  ]);

  const excludedRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE COALESCE(is_excluded, 0) = 1`
  );

  const totalAssets = balanceSheet.assets.total;
  const liabilities = balanceSheet.liabilities.total;
  const netWorth = subMoney(totalAssets, liabilities);
  const aheadBehind = subMoney(netWorth, ownerInvestment);
  const returnOnInvestment =
    ownerInvestment > 0 ? roundMoney((aheadBehind / ownerInvestment) * 100) : 0;

  const snapshot: GrowthSnapshot = {
    netWorth,
    totalAssets,
    liabilities,
    ownerInvestment,
    aheadBehind,
    returnOnInvestment,
    cashAndBank: balanceSheet.assets.cashAndBank,
    inventory: balanceSheet.assets.inventory,
    receivables: balanceSheet.assets.receivables,
    fixedAssets: balanceSheet.assets.fixedAssets,
    excludedAccountsBalance: roundMoney(excludedRow?.total ?? 0),
  };

  const monthKeys = getFiscalYearMonthKeysForStartYear(fyStartYear, fyStartMonth);
  const financialsByMonth = await getFiscalYearFinancialsByMonth(monthKeys);
  let cumulative = 0;
  const months: GrowthMonthRow[] = [];

  for (const monthKey of monthKeys) {
    const fin = financialsByMonth.get(monthKey) ?? {
      revenue: 0,
      cogs: 0,
      operatingExpenses: 0,
      otherIncome: 0,
      netProfit: 0,
    };
    cumulative = addMoney(cumulative, fin.netProfit);
    const hasActivity =
      fin.revenue > 0 ||
      fin.cogs > 0 ||
      fin.operatingExpenses > 0 ||
      fin.otherIncome > 0;

    months.push({
      monthKey,
      label: fiscalMonthLongLabel(monthKey),
      shortLabel: fiscalMonthShortLabel(monthKey),
      netProfit: fin.netProfit,
      revenue: fin.revenue,
      cogs: fin.cogs,
      operatingExpenses: fin.operatingExpenses,
      otherIncome: fin.otherIncome,
      cumulativeSurplus: roundMoney(cumulative),
      hasActivity,
    });
  }

  return {
    snapshot,
    months,
    financialYearRangeLabel: formatFinancialYearShortLabel(fyStartYear),
  };
}

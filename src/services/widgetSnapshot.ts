import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getCurrentMonthKey, monthKeyToLabel, getPeriodSectionTitle } from '../utils/date';
import { formatCurrencyWhole } from '../utils/format';
import {
  getDashboardDailyTrend,
  getDashboardStats,
  type AccountingBasis,
} from './dashboard';

const SNAPSHOT_KEY = '@hisab/widget_snapshot';
const ACCOUNTING_BASIS_KEY = '@hisab/dashboard_accounting_basis';

export const WIDGET_NAMES = [
  'HisabOverview',
  'HisabPeriod',
  'HisabTrend',
  'HisabActions',
] as const;

export type WidgetName = (typeof WIDGET_NAMES)[number];

export interface WidgetTrendDay {
  shortLabel: string;
  sales: number;
  netProfit: number;
}

export interface WidgetSnapshot {
  updatedAt: string;
  periodKey: string;
  periodLabel: string;
  periodTitle: string;
  basis: AccountingBasis;
  netProfit: number;
  grossProfit: number;
  sold: number;
  purchased: number;
  expense: number;
  otherIncome: number;
  totalLiquid: number;
  receivable: number;
  payable: number;
  inventoryValue: number;
  netWorth: number;
  /** Formatted whole-rupee strings for widget TextWidgets. */
  labels: {
    netProfit: string;
    grossProfit: string;
    sold: string;
    purchased: string;
    expense: string;
    otherIncome: string;
    totalLiquid: string;
    receivable: string;
    payable: string;
    netWorth: string;
  };
  trendAvailable: boolean;
  trendDays: WidgetTrendDay[];
}

function emptySnapshot(): WidgetSnapshot {
  const periodKey = getCurrentMonthKey();
  const zero = formatCurrencyWhole(0);
  return {
    updatedAt: new Date().toISOString(),
    periodKey,
    periodLabel: monthKeyToLabel(periodKey),
    periodTitle: getPeriodSectionTitle(periodKey),
    basis: 'accrual',
    netProfit: 0,
    grossProfit: 0,
    sold: 0,
    purchased: 0,
    expense: 0,
    otherIncome: 0,
    totalLiquid: 0,
    receivable: 0,
    payable: 0,
    inventoryValue: 0,
    netWorth: 0,
    labels: {
      netProfit: zero,
      grossProfit: zero,
      sold: zero,
      purchased: zero,
      expense: zero,
      otherIncome: zero,
      totalLiquid: zero,
      receivable: zero,
      payable: zero,
      netWorth: zero,
    },
    trendAvailable: false,
    trendDays: [],
  };
}

async function readBasis(): Promise<AccountingBasis> {
  try {
    const stored = await AsyncStorage.getItem(ACCOUNTING_BASIS_KEY);
    if (stored === 'cash' || stored === 'accrual') return stored;
  } catch {
    // fall through
  }
  return 'accrual';
}

export async function buildWidgetSnapshot(): Promise<WidgetSnapshot> {
  const periodKey = getCurrentMonthKey();
  const basis = await readBasis();
  const [stats, trend] = await Promise.all([
    getDashboardStats(periodKey, basis),
    getDashboardDailyTrend(periodKey, basis),
  ]);

  const periodTitle =
    basis === 'cash'
      ? `${getPeriodSectionTitle(periodKey)} · Cash`
      : getPeriodSectionTitle(periodKey);

  return {
    updatedAt: new Date().toISOString(),
    periodKey,
    periodLabel: monthKeyToLabel(periodKey),
    periodTitle,
    basis,
    netProfit: stats.netProfit,
    grossProfit: stats.grossProfit,
    sold: stats.sold,
    purchased: stats.purchased,
    expense: stats.expense,
    otherIncome: stats.otherIncome,
    totalLiquid: stats.totalLiquid,
    receivable: stats.receivable,
    payable: stats.payable,
    inventoryValue: stats.inventoryValue,
    netWorth: stats.netWorth,
    labels: {
      netProfit: formatCurrencyWhole(stats.netProfit),
      grossProfit: formatCurrencyWhole(stats.grossProfit),
      sold: formatCurrencyWhole(stats.sold),
      purchased: formatCurrencyWhole(stats.purchased),
      expense: formatCurrencyWhole(stats.expense),
      otherIncome: formatCurrencyWhole(stats.otherIncome),
      totalLiquid: formatCurrencyWhole(stats.totalLiquid),
      receivable: formatCurrencyWhole(stats.receivable),
      payable: formatCurrencyWhole(stats.payable),
      netWorth: formatCurrencyWhole(stats.netWorth),
    },
    trendAvailable: trend.available,
    trendDays: trend.days.map((d) => ({
      shortLabel: d.shortLabel,
      sales: d.sales,
      netProfit: d.netProfit,
    })),
  };
}

export async function saveWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WidgetSnapshot;
  } catch {
    return null;
  }
}

export async function loadWidgetSnapshotOrEmpty(): Promise<WidgetSnapshot> {
  return (await loadWidgetSnapshot()) ?? emptySnapshot();
}

/** Rebuild snapshot from SQLite and push to all home-screen widgets (Android only). */
export async function refreshHomeWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const snapshot = await buildWidgetSnapshot();
    await saveWidgetSnapshot(snapshot);

    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { renderWidgetByName } = await import('../widgets/renderWidget');

    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: async () => renderWidgetByName(widgetName, snapshot),
          widgetNotFound: () => {},
        }).catch((err) => {
          console.warn(`[widgets] update ${widgetName} failed`, err);
        })
      )
    );
  } catch (err) {
    console.warn('[widgets] refresh failed', err);
  }
}

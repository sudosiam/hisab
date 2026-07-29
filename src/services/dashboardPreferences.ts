import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountingBasis } from './dashboard';

export type DashboardSectionId = 'hero' | 'trend' | 'shortcuts' | 'activity';

export const DASHBOARD_SECTION_IDS: DashboardSectionId[] = [
  'hero',
  'trend',
  'shortcuts',
  'activity',
];

export const DASHBOARD_SECTION_LABELS: Record<DashboardSectionId, string> = {
  hero: 'Summary KPIs',
  trend: 'Trend chart',
  shortcuts: 'Shortcuts',
  activity: 'Recent activity',
};

export const RECENT_ACTIVITY_LIMIT_OPTIONS = [3, 5, 8, 10] as const;
export type RecentActivityLimit = (typeof RECENT_ACTIVITY_LIMIT_OPTIONS)[number];

const SECTION_ORDER_KEY = '@hisab/dashboard_section_order';
const HIDDEN_SECTIONS_KEY = '@hisab/dashboard_hidden_sections';
const AMOUNTS_HIDDEN_KEY = '@hisab/dashboard_amounts_hidden';
const ACCOUNTING_BASIS_KEY = '@hisab/dashboard_accounting_basis';
const SHOW_PERIOD_PICKER_KEY = '@hisab/dashboard_show_period_picker';
const SHOW_BASIS_TOGGLE_KEY = '@hisab/dashboard_show_basis_toggle';
const RECENT_LIMIT_KEY = '@hisab/dashboard_recent_limit';

export interface DashboardPreferences {
  sectionOrder: DashboardSectionId[];
  hiddenSections: DashboardSectionId[];
  amountsHidden: boolean;
  accountingBasis: AccountingBasis;
  showPeriodPicker: boolean;
  showBasisToggle: boolean;
  recentActivityLimit: RecentActivityLimit;
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  sectionOrder: [...DASHBOARD_SECTION_IDS],
  hiddenSections: [],
  amountsHidden: false,
  accountingBasis: 'accrual',
  showPeriodPicker: true,
  showBasisToggle: true,
  recentActivityLimit: 5,
};

export function parseSectionOrder(raw: string | null): DashboardSectionId[] {
  if (!raw) return [...DASHBOARD_SECTION_IDS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DASHBOARD_SECTION_IDS];
    const valid = parsed.filter((id): id is DashboardSectionId =>
      DASHBOARD_SECTION_IDS.includes(id as DashboardSectionId)
    );
    const missing = DASHBOARD_SECTION_IDS.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return [...DASHBOARD_SECTION_IDS];
  }
}

function parseHiddenSections(raw: string | null): DashboardSectionId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is DashboardSectionId =>
      DASHBOARD_SECTION_IDS.includes(id as DashboardSectionId)
    );
  } catch {
    return [];
  }
}

function parseRecentLimit(raw: string | null): RecentActivityLimit {
  const n = raw ? Number.parseInt(raw, 10) : 5;
  if ((RECENT_ACTIVITY_LIMIT_OPTIONS as readonly number[]).includes(n)) {
    return n as RecentActivityLimit;
  }
  return 5;
}

export async function getDashboardPreferences(): Promise<DashboardPreferences> {
  const [orderRaw, hiddenRaw, amounts, basis, showPeriod, showBasis, recentLimit] =
    await AsyncStorage.multiGet([
      SECTION_ORDER_KEY,
      HIDDEN_SECTIONS_KEY,
      AMOUNTS_HIDDEN_KEY,
      ACCOUNTING_BASIS_KEY,
      SHOW_PERIOD_PICKER_KEY,
      SHOW_BASIS_TOGGLE_KEY,
      RECENT_LIMIT_KEY,
    ]);

  const accountingBasis =
    basis[1] === 'cash' || basis[1] === 'accrual' ? basis[1] : 'accrual';

  return {
    sectionOrder: parseSectionOrder(orderRaw[1]),
    hiddenSections: parseHiddenSections(hiddenRaw[1]),
    amountsHidden: amounts[1] === '1',
    accountingBasis,
    showPeriodPicker: showPeriod[1] !== '0',
    showBasisToggle: showBasis[1] !== '0',
    recentActivityLimit: parseRecentLimit(recentLimit[1]),
  };
}

export async function setDashboardSectionOrder(order: DashboardSectionId[]): Promise<void> {
  const normalized = parseSectionOrder(JSON.stringify(order));
  await AsyncStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(normalized));
}

export async function setDashboardHiddenSections(
  hidden: DashboardSectionId[]
): Promise<void> {
  const cleaned = hidden.filter((id) => DASHBOARD_SECTION_IDS.includes(id));
  await AsyncStorage.setItem(HIDDEN_SECTIONS_KEY, JSON.stringify(cleaned));
}

export async function setDashboardAmountsHidden(hidden: boolean): Promise<void> {
  await AsyncStorage.setItem(AMOUNTS_HIDDEN_KEY, hidden ? '1' : '0');
}

export async function setDashboardAccountingBasis(basis: AccountingBasis): Promise<void> {
  await AsyncStorage.setItem(ACCOUNTING_BASIS_KEY, basis);
}

export async function setDashboardShowPeriodPicker(show: boolean): Promise<void> {
  await AsyncStorage.setItem(SHOW_PERIOD_PICKER_KEY, show ? '1' : '0');
}

export async function setDashboardShowBasisToggle(show: boolean): Promise<void> {
  await AsyncStorage.setItem(SHOW_BASIS_TOGGLE_KEY, show ? '1' : '0');
}

export async function setDashboardRecentActivityLimit(
  limit: RecentActivityLimit
): Promise<void> {
  await AsyncStorage.setItem(RECENT_LIMIT_KEY, String(limit));
}

export async function resetDashboardPreferences(): Promise<void> {
  await AsyncStorage.multiSet([
    [SECTION_ORDER_KEY, JSON.stringify(DEFAULT_DASHBOARD_PREFERENCES.sectionOrder)],
    [HIDDEN_SECTIONS_KEY, JSON.stringify([])],
    [AMOUNTS_HIDDEN_KEY, '0'],
    [ACCOUNTING_BASIS_KEY, 'accrual'],
    [SHOW_PERIOD_PICKER_KEY, '1'],
    [SHOW_BASIS_TOGGLE_KEY, '1'],
    [RECENT_LIMIT_KEY, '5'],
  ]);
}

export function visibleSectionOrder(prefs: DashboardPreferences): DashboardSectionId[] {
  const hidden = new Set(prefs.hiddenSections);
  return prefs.sectionOrder.filter((id) => !hidden.has(id));
}

export function moveSectionInOrder(
  order: DashboardSectionId[],
  id: DashboardSectionId,
  direction: -1 | 1
): DashboardSectionId[] {
  const index = order.indexOf(id);
  if (index < 0) return order;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

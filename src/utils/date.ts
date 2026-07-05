import { format, isValid, parse, startOfMonth, endOfMonth } from 'date-fns';

export function getCurrentMonthKey(): string {
  return format(new Date(), 'yyyy-MM');
}

export function monthKeyToLabel(monthKey: string): string {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  return format(date, 'MMMM yyyy');
}

export const FY_PERIOD_PREFIX = 'fy:';

export function isFinancialYearPeriodKey(periodKey: string): boolean {
  return periodKey.startsWith(FY_PERIOD_PREFIX);
}

export function makeFinancialYearPeriodKey(fyStartYear: number): string {
  return `${FY_PERIOD_PREFIX}${fyStartYear}`;
}

/** When viewing FY totals, keep the period key aligned with settings FY. */
export function syncPeriodKeyWithFinancialYear(periodKey: string, fyStartYear: number): string {
  if (isFinancialYearPeriodKey(periodKey)) {
    return makeFinancialYearPeriodKey(fyStartYear);
  }
  return periodKey;
}

export function parseFinancialYearPeriodKey(periodKey: string): number | null {
  if (!isFinancialYearPeriodKey(periodKey)) return null;
  const year = parseInt(periodKey.slice(FY_PERIOD_PREFIX.length), 10);
  return Number.isFinite(year) ? year : null;
}

export function getMonthRange(monthKey: string): { start: string; end: string } {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  return {
    start: format(startOfMonth(date), 'yyyy-MM-dd'),
    end: format(endOfMonth(date), 'yyyy-MM-dd'),
  };
}

export function getFinancialYearRange(
  fyStartYear: number,
  startMonth = 4
): { start: string; end: string } {
  const monthKeys = getFiscalYearMonthKeysForStartYear(fyStartYear, startMonth);
  const first = getMonthRange(monthKeys[0]);
  const last = getMonthRange(monthKeys[monthKeys.length - 1]);
  return { start: first.start, end: last.end };
}

export function getPeriodRange(
  periodKey: string,
  fyStartMonth = 4
): { start: string; end: string } {
  const fyStartYear = parseFinancialYearPeriodKey(periodKey);
  if (fyStartYear !== null) {
    return getFinancialYearRange(fyStartYear, fyStartMonth);
  }
  return getMonthRange(periodKey);
}

export function shiftPeriod(periodKey: string, delta: number): string {
  const fyStartYear = parseFinancialYearPeriodKey(periodKey);
  if (fyStartYear !== null) {
    return makeFinancialYearPeriodKey(fyStartYear + delta);
  }
  return shiftMonth(periodKey, delta);
}

export function periodKeyToLabel(periodKey: string): string {
  const fyStartYear = parseFinancialYearPeriodKey(periodKey);
  if (fyStartYear !== null) {
    return `FY ${formatFinancialYearShortLabel(fyStartYear)}`;
  }
  return monthKeyToLabel(periodKey);
}

export function getPeriodSectionTitle(periodKey: string): string {
  return isFinancialYearPeriodKey(periodKey) ? 'This Financial Year' : 'This Month';
}

export function getPeriodTotalLabel(periodKey: string): string {
  return isFinancialYearPeriodKey(periodKey) ? 'FY Total' : 'Month Total';
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function shiftMonth(monthKey: string, delta: number): string {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  date.setMonth(date.getMonth() + delta);
  return format(date, 'yyyy-MM');
}

export const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function normalizeFinancialYearStartMonth(month: number): number {
  if (!Number.isFinite(month) || month < 1 || month > 12) return 4;
  return Math.floor(month);
}

/** e.g. 2025 → "25-26" (Apr–Mar style FY) */
export function formatFinancialYearShortLabel(fyStartYear: number): string {
  const start = String(fyStartYear % 100).padStart(2, '0');
  const end = String((fyStartYear + 1) % 100).padStart(2, '0');
  return `${start}-${end}`;
}

export function getFiscalYearStartYear(asOf: Date = new Date(), startMonth = 4): number {
  const fyStartMonth = normalizeFinancialYearStartMonth(startMonth);
  const calMonth = asOf.getMonth() + 1;
  const calYear = asOf.getFullYear();
  return calMonth >= fyStartMonth ? calYear : calYear - 1;
}

export function getFinancialYearSelectOptions(
  startMonth = 4,
  asOf: Date = new Date(),
  pastYears = 4,
  futureYears = 2,
  includeStartYear?: number
): { startYear: number; label: string }[] {
  const current = getFiscalYearStartYear(asOf, startMonth);
  let from = current - pastYears;
  let to = current + futureYears;
  if (includeStartYear !== undefined) {
    from = Math.min(from, includeStartYear);
    to = Math.max(to, includeStartYear);
  }
  const options: { startYear: number; label: string }[] = [];
  for (let y = from; y <= to; y++) {
    options.push({ startYear: y, label: formatFinancialYearShortLabel(y) });
  }
  return options;
}

/** e.g. April start → "Apr–Mar", January start → "Jan–Dec" */
export function getFinancialYearRangeLabel(startMonth: number): string {
  const start = normalizeFinancialYearStartMonth(startMonth);
  const endMonth = start === 1 ? 12 : start - 1;
  return `${MONTH_SHORT_NAMES[start - 1]}–${MONTH_SHORT_NAMES[endMonth - 1]}`;
}

export function getFiscalYearMonthKeysForStartYear(fyStartYear: number, startMonth = 4): string[] {
  const fyStartMonth = normalizeFinancialYearStartMonth(startMonth);
  const keys: string[] = [];

  for (let i = 0; i < 12; i++) {
    const month = ((fyStartMonth - 1 + i) % 12) + 1;
    const year = fyStartYear + Math.floor((fyStartMonth - 1 + i) / 12);
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
  }

  return keys;
}

/** Returns 12 month keys for the FY containing `asOf`. `startMonth` is 1–12 (Jan–Dec). */
export function getFiscalYearMonthKeys(asOf: Date = new Date(), startMonth = 4): string[] {
  return getFiscalYearMonthKeysForStartYear(getFiscalYearStartYear(asOf, startMonth), startMonth);
}

export function fiscalMonthShortLabel(monthKey: string): string {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  return format(date, 'MMM');
}

export function fiscalMonthLongLabel(monthKey: string): string {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  return format(date, 'MMM, yyyy');
}

/** Validates YYYY-MM-DD strings used for SQLite date comparisons. */
export function isValidISODate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === dateStr;
}

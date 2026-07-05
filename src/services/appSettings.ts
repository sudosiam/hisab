import { getDatabase } from '../db/database';
import {
  formatFinancialYearShortLabel,
  getFiscalYearStartYear,
  normalizeFinancialYearStartMonth,
} from '../utils/date';

const FINANCIAL_YEAR_START_MONTH_KEY = 'financial_year_start_month';
const FINANCIAL_YEAR_START_YEAR_KEY = 'financial_year_start_year';
const FINANCIAL_YEAR_PINNED_KEY = 'financial_year_pinned';
const SALE_INVOICE_PREFIX_KEY = 'sale_invoice_prefix';
const PURCHASE_INVOICE_PREFIX_KEY = 'purchase_invoice_prefix';
const DEFAULT_FINANCIAL_YEAR_START_MONTH = 4;
const DEFAULT_SALE_INVOICE_PREFIX = 'S';
const DEFAULT_PURCHASE_INVOICE_PREFIX = 'P';

async function getSettingValue(key: string): Promise<string | null> {
  const db = await getDatabase();
  const setting = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [key]
  );
  if (setting?.value === undefined || setting.value === '') return null;
  return setting.value;
}

async function setSettingValue(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
}

export async function getFinancialYearStartMonth(): Promise<number> {
  const db = await getDatabase();
  const setting = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [FINANCIAL_YEAR_START_MONTH_KEY]
  );

  if (setting?.value !== undefined && setting.value !== '') {
    const parsed = parseInt(setting.value, 10);
    if (!Number.isNaN(parsed)) {
      return normalizeFinancialYearStartMonth(parsed);
    }
  }

  return DEFAULT_FINANCIAL_YEAR_START_MONTH;
}

export async function setFinancialYearStartMonth(month: number): Promise<void> {
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error('Invalid financial year start month');
  }
  await setSettingValue(FINANCIAL_YEAR_START_MONTH_KEY, String(Math.floor(month)));
}

async function getRawSelectedFinancialYearStartYear(): Promise<number | null> {
  const value = await getSettingValue(FINANCIAL_YEAR_START_YEAR_KEY);
  if (value === null) return null;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 2000 || parsed > 2100) return null;
  return parsed;
}

async function isFinancialYearPinned(): Promise<boolean> {
  const value = await getSettingValue(FINANCIAL_YEAR_PINNED_KEY);
  return value === '1' || value === 'true';
}

async function setFinancialYearPinned(pinned: boolean): Promise<void> {
  await setSettingValue(FINANCIAL_YEAR_PINNED_KEY, pinned ? '1' : '0');
}

/** Keeps FY on the current fiscal year unless the user pinned a historical year. */
export async function syncSelectedFinancialYearToCurrent(): Promise<number> {
  const startMonth = await getFinancialYearStartMonth();
  const currentYear = getFiscalYearStartYear(new Date(), startMonth);
  const pinned = await isFinancialYearPinned();

  if (pinned) {
    const stored = await getRawSelectedFinancialYearStartYear();
    if (stored !== null && stored <= currentYear) {
      return stored;
    }
  }

  const stored = await getRawSelectedFinancialYearStartYear();
  if (stored !== currentYear) {
    await setSettingValue(FINANCIAL_YEAR_START_YEAR_KEY, String(currentYear));
  }
  if (pinned) {
    await setFinancialYearPinned(false);
  }
  return currentYear;
}

export async function getSelectedFinancialYearStartYear(): Promise<number> {
  return syncSelectedFinancialYearToCurrent();
}

export async function setSelectedFinancialYearStartYear(startYear: number): Promise<void> {
  if (!Number.isFinite(startYear) || startYear < 2000 || startYear > 2100) {
    throw new Error('Invalid financial year');
  }

  const startMonth = await getFinancialYearStartMonth();
  const currentYear = getFiscalYearStartYear(new Date(), startMonth);
  const normalized = Math.floor(startYear);

  await setSettingValue(FINANCIAL_YEAR_START_YEAR_KEY, String(normalized));
  await setFinancialYearPinned(normalized < currentYear);
}

export async function getSelectedFinancialYearLabel(): Promise<string> {
  const startYear = await getSelectedFinancialYearStartYear();
  return formatFinancialYearShortLabel(startYear);
}

export async function getSaleInvoicePrefix(): Promise<string> {
  const value = await getSettingValue(SALE_INVOICE_PREFIX_KEY);
  if (value) return value.trim().toUpperCase();
  return DEFAULT_SALE_INVOICE_PREFIX;
}

export async function setSaleInvoicePrefix(prefix: string): Promise<void> {
  const cleaned = prefix.trim().replace(/\s+/g, '').toUpperCase();
  if (!cleaned || !/^[A-Z0-9-]+$/.test(cleaned)) {
    throw new Error('Use letters, numbers, or hyphen only');
  }
  await setSettingValue(SALE_INVOICE_PREFIX_KEY, cleaned.slice(0, 12));
}

export async function getPurchaseInvoicePrefix(): Promise<string> {
  const value = await getSettingValue(PURCHASE_INVOICE_PREFIX_KEY);
  if (value) return value.trim().toUpperCase();
  return DEFAULT_PURCHASE_INVOICE_PREFIX;
}

export async function setPurchaseInvoicePrefix(prefix: string): Promise<void> {
  const cleaned = prefix.trim().replace(/\s+/g, '').toUpperCase();
  if (!cleaned || !/^[A-Z0-9-]+$/.test(cleaned)) {
    throw new Error('Use letters, numbers, or hyphen only');
  }
  await setSettingValue(PURCHASE_INVOICE_PREFIX_KEY, cleaned.slice(0, 12));
}

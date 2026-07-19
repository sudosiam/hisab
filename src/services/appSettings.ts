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
const BOS_INVOICE_PREFIX_KEY = 'bos_invoice_prefix';
const PURCHASE_INVOICE_PREFIX_KEY = 'purchase_invoice_prefix';
const BUSINESS_NAME_KEY = 'business_name';
const BUSINESS_ADDRESS_KEY = 'business_address';
const BUSINESS_GSTIN_KEY = 'business_gstin';
const BUSINESS_STATE_KEY = 'business_state';
const GST_ENABLED_KEY = 'gst_enabled';
const TAX_INCLUSIVE_KEY = 'tax_inclusive_pricing';
const UPI_ID_KEY = 'business_upi_id';
const WHATSAPP_MESSAGE_TEMPLATE_KEY = 'whatsapp_message_template';
const DEFAULT_FINANCIAL_YEAR_START_MONTH = 4;
const DEFAULT_SALE_INVOICE_PREFIX = 'S';
const DEFAULT_BOS_INVOICE_PREFIX = 'BOS';
const DEFAULT_PURCHASE_INVOICE_PREFIX = 'P';
const DEFAULT_WHATSAPP_TEMPLATE =
  'Hi {party}, please find {doc_type} {invoice_no} for {amount}. Thank you.';
const INVOICE_SETTING_MAX_LEN = 40;

function isValidInvoiceSetting(value: string): boolean {
  const cleaned = value.trim().replace(/\s+/g, '').toUpperCase();
  if (!cleaned) return false;
  const withNumber = cleaned.match(/^(.*)-(\d+)$/);
  if (withNumber) {
    const stem = withNumber[1];
    return !!stem && /^[A-Z0-9-]+$/.test(stem);
  }
  return /^[A-Z0-9-]+$/.test(cleaned);
}

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
  if (!isValidInvoiceSetting(cleaned)) {
    throw new Error('Use your next invoice number, e.g. BPH2627-0003');
  }
  await setSettingValue(SALE_INVOICE_PREFIX_KEY, cleaned.slice(0, INVOICE_SETTING_MAX_LEN));
}

export async function getBosInvoicePrefix(): Promise<string> {
  const value = await getSettingValue(BOS_INVOICE_PREFIX_KEY);
  if (value) return value.trim().toUpperCase();
  return DEFAULT_BOS_INVOICE_PREFIX;
}

export async function setBosInvoicePrefix(prefix: string): Promise<void> {
  const cleaned = prefix.trim().replace(/\s+/g, '').toUpperCase();
  if (!isValidInvoiceSetting(cleaned)) {
    throw new Error('Use your next BOS number, e.g. BOS2627-0001');
  }
  await setSettingValue(BOS_INVOICE_PREFIX_KEY, cleaned.slice(0, INVOICE_SETTING_MAX_LEN));
}

export async function getPurchaseInvoicePrefix(): Promise<string> {
  const value = await getSettingValue(PURCHASE_INVOICE_PREFIX_KEY);
  if (value) return value.trim().toUpperCase();
  return DEFAULT_PURCHASE_INVOICE_PREFIX;
}

export async function setPurchaseInvoicePrefix(prefix: string): Promise<void> {
  const cleaned = prefix.trim().replace(/\s+/g, '').toUpperCase();
  if (!isValidInvoiceSetting(cleaned)) {
    throw new Error('Use your next invoice number, e.g. GHP2728-000000013');
  }
  await setSettingValue(PURCHASE_INVOICE_PREFIX_KEY, cleaned.slice(0, INVOICE_SETTING_MAX_LEN));
}

export async function getBusinessName(): Promise<string> {
  return (await getSettingValue(BUSINESS_NAME_KEY))?.trim() || '';
}

export async function setBusinessName(name: string): Promise<void> {
  await setSettingValue(BUSINESS_NAME_KEY, name.trim().slice(0, 120));
}

export async function getBusinessAddress(): Promise<string> {
  return (await getSettingValue(BUSINESS_ADDRESS_KEY))?.trim() || '';
}

export async function setBusinessAddress(address: string): Promise<void> {
  await setSettingValue(BUSINESS_ADDRESS_KEY, address.trim().slice(0, 500));
}

export async function getBusinessGstin(): Promise<string> {
  return (await getSettingValue(BUSINESS_GSTIN_KEY))?.trim().toUpperCase() || '';
}

export async function setBusinessGstin(gstin: string): Promise<void> {
  const cleaned = gstin.trim().toUpperCase();
  if (cleaned) {
    const { isValidGstin } = await import('./gst');
    if (!isValidGstin(cleaned)) {
      throw new Error('Enter a valid 15-character GSTIN');
    }
  }
  await setSettingValue(BUSINESS_GSTIN_KEY, cleaned.slice(0, 15));
}

export async function getBusinessState(): Promise<string> {
  return (await getSettingValue(BUSINESS_STATE_KEY))?.trim() || '';
}

export async function setBusinessState(stateCode: string): Promise<void> {
  const cleaned = stateCode.trim().slice(0, 2);
  if (cleaned) {
    const { isValidStateCode } = await import('./gst');
    if (!isValidStateCode(cleaned)) {
      throw new Error('Enter a valid 2-digit GST state code (e.g. 27 for Maharashtra)');
    }
  }
  await setSettingValue(BUSINESS_STATE_KEY, cleaned);
}

export async function isGstEnabled(): Promise<boolean> {
  const value = await getSettingValue(GST_ENABLED_KEY);
  if (value === null) return true;
  return value === '1' || value === 'true';
}

export async function setGstEnabled(enabled: boolean): Promise<void> {
  await setSettingValue(GST_ENABLED_KEY, enabled ? '1' : '0');
}

export async function isTaxInclusivePricing(): Promise<boolean> {
  const value = await getSettingValue(TAX_INCLUSIVE_KEY);
  return value === '1' || value === 'true';
}

export async function setTaxInclusivePricing(enabled: boolean): Promise<void> {
  await setSettingValue(TAX_INCLUSIVE_KEY, enabled ? '1' : '0');
}

export async function getBusinessUpiId(): Promise<string> {
  return (await getSettingValue(UPI_ID_KEY))?.trim() || '';
}

export async function setBusinessUpiId(upiId: string): Promise<void> {
  const cleaned = upiId.trim().toLowerCase();
  if (cleaned && !/^[\w.\-]+@[\w.\-]+$/.test(cleaned)) {
    throw new Error('Enter a valid UPI ID, e.g. business@okaxis');
  }
  await setSettingValue(UPI_ID_KEY, cleaned.slice(0, 80));
}

export async function getWhatsappMessageTemplate(): Promise<string> {
  return (await getSettingValue(WHATSAPP_MESSAGE_TEMPLATE_KEY))?.trim() || DEFAULT_WHATSAPP_TEMPLATE;
}

export async function setWhatsappMessageTemplate(template: string): Promise<void> {
  const cleaned = template.trim();
  await setSettingValue(
    WHATSAPP_MESSAGE_TEMPLATE_KEY,
    cleaned ? cleaned.slice(0, 500) : DEFAULT_WHATSAPP_TEMPLATE
  );
}

export async function getBusinessProfile(): Promise<{
  business_name: string;
  business_address: string;
  business_gstin: string;
  business_state: string;
  gst_enabled: boolean;
  tax_inclusive: boolean;
  business_upi_id: string;
  whatsapp_message_template: string;
}> {
  const [
    business_name,
    business_address,
    business_gstin,
    business_state,
    gst_enabled,
    tax_inclusive,
    business_upi_id,
    whatsapp_message_template,
  ] = await Promise.all([
    getBusinessName(),
    getBusinessAddress(),
    getBusinessGstin(),
    getBusinessState(),
    isGstEnabled(),
    isTaxInclusivePricing(),
    getBusinessUpiId(),
    getWhatsappMessageTemplate(),
  ]);
  return {
    business_name,
    business_address,
    business_gstin,
    business_state,
    gst_enabled,
    tax_inclusive,
    business_upi_id,
    whatsapp_message_template,
  };
}

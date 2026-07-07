import { getDatabase } from '../db/database';
import {
  getPurchaseInvoicePrefix,
  getSaleInvoicePrefix,
  setPurchaseInvoicePrefix,
  setSaleInvoicePrefix,
} from './appSettings';

export interface InvoiceNumberTemplate {
  /** Text before the trailing sequence, e.g. BPH2627 or GHP2728 */
  stem: string;
  /** Next sequence number to assign (from settings or parsed invoice). */
  nextSequence: number;
  /** Zero-padding width for the numeric suffix. */
  digitWidth: number;
}

/** Parse settings like BPH2627-0003, GHP2728-000000013, or legacy prefix S. */
export function parseInvoiceTemplate(value: string): InvoiceNumberTemplate | null {
  const cleaned = value.trim().replace(/\s+/g, '').toUpperCase();
  if (!cleaned) return null;

  const withNumber = cleaned.match(/^(.*)-(\d+)$/);
  if (withNumber) {
    const stem = withNumber[1];
    const digits = withNumber[2];
    if (!stem || !/^[A-Z0-9-]+$/.test(stem)) return null;
    const nextSequence = parseInt(digits, 10);
    if (!Number.isFinite(nextSequence) || nextSequence < 1) return null;
    return { stem, nextSequence, digitWidth: digits.length };
  }

  if (/^[A-Z0-9-]+$/.test(cleaned)) {
    return { stem: cleaned, nextSequence: 1, digitWidth: 4 };
  }

  return null;
}

export function normalizeInvoicePrefix(value: string, fallback: string): string {
  const template = parseInvoiceTemplate(value);
  if (!template) {
    const templateFallback = parseInvoiceTemplate(fallback);
    return templateFallback
      ? formatInvoiceSequence(
          templateFallback.stem,
          templateFallback.nextSequence,
          templateFallback.digitWidth
        )
      : fallback;
  }
  return formatInvoiceSequence(template.stem, template.nextSequence, template.digitWidth);
}

export function formatInvoiceSequence(
  stem: string,
  sequence: number,
  digitWidth: number
): string {
  const numStr = String(sequence);
  const padded =
    numStr.length >= digitWidth ? numStr : numStr.padStart(digitWidth, '0');
  return `${stem}-${padded}`;
}

export function parseInvoiceSequence(invoiceNo: string, stem: string): number | null {
  const normalized = invoiceNo.trim().toUpperCase();
  const prefix = stem.trim().toUpperCase();
  const expected = `${prefix}-`;
  if (!normalized.startsWith(expected)) return null;
  const suffix = normalized.slice(expected.length);
  if (!/^\d+$/.test(suffix)) return null;
  const parsed = parseInt(suffix, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getMaxInvoiceSequence(
  table: 'sales' | 'purchases',
  stem: string
): Promise<number> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ invoice_no: string }>(`SELECT invoice_no FROM ${table}`);
  let max = 0;
  for (const row of rows) {
    const seq = parseInvoiceSequence(row.invoice_no, stem);
    if (seq !== null && seq > max) max = seq;
  }
  return max;
}

function resolveNextSequence(
  template: InvoiceNumberTemplate,
  maxDb: number
): { sequence: number; digitWidth: number } {
  const sequence = Math.max(template.nextSequence, maxDb + 1);
  const digitWidth = Math.max(template.digitWidth, String(sequence).length);
  return { sequence, digitWidth };
}

async function getNextInvoiceNo(
  table: 'sales' | 'purchases',
  getSetting: () => Promise<string>,
  defaultStem: string
): Promise<string> {
  const settingValue = await getSetting();
  const template = parseInvoiceTemplate(settingValue) ?? {
    stem: defaultStem,
    nextSequence: 1,
    digitWidth: 4,
  };
  const maxDb = await getMaxInvoiceSequence(table, template.stem);
  const { sequence, digitWidth } = resolveNextSequence(template, maxDb);
  return formatInvoiceSequence(template.stem, sequence, digitWidth);
}

export async function getNextSaleInvoiceNo(): Promise<string> {
  return getNextInvoiceNo('sales', getSaleInvoicePrefix, 'S');
}

export async function getNextPurchaseInvoiceNo(): Promise<string> {
  return getNextInvoiceNo('purchases', getPurchaseInvoicePrefix, 'P');
}

/** Preview from a settings value only (ignores database). */
export function previewNextInvoiceFromSetting(value: string, fallbackStem: string): string {
  const template = parseInvoiceTemplate(value) ?? {
    stem: fallbackStem,
    nextSequence: 1,
    digitWidth: 4,
  };
  return formatInvoiceSequence(
    template.stem,
    template.nextSequence,
    template.digitWidth
  );
}

/** After a sale/purchase is saved, advance the stored next number. */
export async function syncNextInvoiceSettingAfterUse(
  kind: 'sale' | 'purchase',
  usedInvoiceNo: string
): Promise<void> {
  const used = parseInvoiceTemplate(usedInvoiceNo);
  if (!used) return;

  const getSetting = kind === 'sale' ? getSaleInvoicePrefix : getPurchaseInvoicePrefix;
  const setSetting = kind === 'sale' ? setSaleInvoicePrefix : setPurchaseInvoicePrefix;

  const currentValue = await getSetting();
  const current = parseInvoiceTemplate(currentValue);
  if (!current || current.stem !== used.stem) return;

  const usedSeq = used.nextSequence;
  const nextSeq = Math.max(current.nextSequence, usedSeq + 1);
  const digitWidth = Math.max(current.digitWidth, used.digitWidth, String(nextSeq).length);
  await setSetting(formatInvoiceSequence(used.stem, nextSeq, digitWidth));
}

/** True when an insert failed because the invoice number unique index tripped. */
export function isInvoiceNoCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed: (sales|purchases)\.invoice_no/i.test(message);
}

export function isInvoiceNumberTakenError(error: unknown): boolean {
  if (isInvoiceNoCollision(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Invoice number already exists');
}

export async function isInvoiceNumberDuplicate(
  table: 'sales' | 'purchases',
  invoiceNo: string,
  excludeId?: number
): Promise<boolean> {
  const trimmed = invoiceNo.trim();
  if (!trimmed) return false;

  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM ${table} WHERE invoice_no = ?`,
    [trimmed]
  );
  return !!existing && existing.id !== excludeId;
}

/** @deprecated Duplicates are allowed — use isInvoiceNumberDuplicate for UI warnings. */
export async function assertUniqueInvoiceNo(
  table: 'sales' | 'purchases',
  invoiceNo: string,
  excludeId?: number
): Promise<void> {
  if (await isInvoiceNumberDuplicate(table, invoiceNo, excludeId)) {
    throw new Error('Invoice number already exists');
  }
}

export async function resolveSaleInvoiceNo(requested?: string): Promise<string> {
  const trimmed = requested?.trim();
  if (trimmed) return trimmed;
  return getNextSaleInvoiceNo();
}

export async function resolvePurchaseInvoiceNo(requested?: string): Promise<string> {
  const trimmed = requested?.trim();
  if (trimmed) return trimmed;
  return getNextPurchaseInvoiceNo();
}

import { getDatabase } from '../db/database';
import {
  getPurchaseInvoicePrefix,
  getSaleInvoicePrefix,
} from './appSettings';

export function normalizeInvoicePrefix(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/\s+/g, '').toUpperCase();
  if (!cleaned || !/^[A-Z0-9-]+$/.test(cleaned)) return fallback;
  return cleaned.slice(0, 12);
}

export function formatInvoiceNo(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export function parseInvoiceSequence(invoiceNo: string, prefix: string): number | null {
  const normalizedPrefix = prefix.trim();
  if (!invoiceNo.startsWith(normalizedPrefix)) return null;
  const suffix = invoiceNo.slice(normalizedPrefix.length);
  const match = suffix.match(/^-(\d+)$/);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getMaxInvoiceSequence(
  table: 'sales' | 'purchases',
  prefix: string
): Promise<number> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ invoice_no: string }>(`SELECT invoice_no FROM ${table}`);
  let max = 0;
  for (const row of rows) {
    const seq = parseInvoiceSequence(row.invoice_no, prefix);
    if (seq !== null && seq > max) max = seq;
  }
  return max;
}

export async function getNextSaleInvoiceNo(): Promise<string> {
  const prefix = await getSaleInvoicePrefix();
  const max = await getMaxInvoiceSequence('sales', prefix);
  return formatInvoiceNo(prefix, max + 1);
}

export async function getNextPurchaseInvoiceNo(): Promise<string> {
  const prefix = await getPurchaseInvoicePrefix();
  const max = await getMaxInvoiceSequence('purchases', prefix);
  return formatInvoiceNo(prefix, max + 1);
}

/** True when an insert failed because the invoice number unique index tripped. */
export function isInvoiceNoCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed: (sales|purchases)\.invoice_no/i.test(message);
}

export async function assertUniqueInvoiceNo(
  table: 'sales' | 'purchases',
  invoiceNo: string,
  excludeId?: number
): Promise<void> {
  const trimmed = invoiceNo.trim();
  if (!trimmed) throw new Error('Invoice number is required');

  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM ${table} WHERE invoice_no = ?`,
    [trimmed]
  );
  if (existing && existing.id !== excludeId) {
    throw new Error('Invoice number already exists');
  }
}

export async function resolveSaleInvoiceNo(requested?: string): Promise<string> {
  const trimmed = requested?.trim();
  if (trimmed) {
    await assertUniqueInvoiceNo('sales', trimmed);
    return trimmed;
  }
  return getNextSaleInvoiceNo();
}

export async function resolvePurchaseInvoiceNo(requested?: string): Promise<string> {
  const trimmed = requested?.trim();
  if (trimmed) {
    await assertUniqueInvoiceNo('purchases', trimmed);
    return trimmed;
  }
  return getNextPurchaseInvoiceNo();
}

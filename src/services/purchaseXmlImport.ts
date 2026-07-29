/**
 * Hisab-native multi-purchase XML import (not Tally).
 * Format: <hisabPurchases><purchase …><item …/></purchase></hisabPurchases>
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '../db/database';
import { isValidISODate } from '../utils/date';
import { parseAmountInput, parseMoneyInput } from '../utils/format';
import { roundQty } from '../utils/money';
import { deferDeleteCacheFile } from '../utils/tempShareFiles';
import { createProduct, getProducts } from './inventory';
import { upsertParty } from './parties';
import { createPurchase } from './purchases';

/** Same cap as Tally import — reject pathological dumps before regex work. */
export const PURCHASE_IMPORT_MAX_CHARS = 10 * 1024 * 1024;

export const PURCHASE_IMPORT_SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hisabPurchases>
  <purchase
    supplier="Supply Co"
    date="2026-04-02"
    purchaseNo="P-1001"
    vendorInvoiceNo="VIN-55"
    notes="April stock"
    discount="10.00">
    <item product="Notebook A5" qty="10" unitCost="40.00" hsn="482010"/>
    <item product="Pen Blue" qty="100" unitCost="5.00"/>
  </purchase>
  <purchase supplier="Office Mart" date="2026-04-03" purchaseNo="P-1002">
    <item product="A4 Paper" qty="5" unitCost="250"/>
  </purchase>
</hisabPurchases>
`;

export type PurchaseImportSkipReason = { reason: string; count: number };

export type PurchaseImportResult = {
  imported: number;
  vendorsTouched: number;
  productsCreated: number;
  skipped: number;
  skipReasons: PurchaseImportSkipReason[];
  errors: string[];
};

type ParsedItem = {
  product: string;
  qty: number;
  unitCostPaise: number;
  hsn: string;
};

type ParsedPurchase = {
  supplier: string;
  date: string;
  purchaseNo: string;
  vendorInvoiceNo: string;
  notes: string;
  discountPaise: number;
  items: ParsedItem[];
};

function bumpSkip(map: Map<string, number>, reason: string) {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

/** Read a double-quoted attribute from an opening-tag attribute blob. */
export function xmlAttr(attrs: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = attrs.match(re);
  return (m?.[1] ?? '').trim();
}

/** Extract <purchase …>…</purchase> blocks (attrs + inner). */
export function extractPurchaseBlocks(xml: string): { attrs: string; inner: string }[] {
  const out: { attrs: string; inner: string }[] = [];
  const re = /<purchase\b([^>]*)>([\s\S]*?)<\/purchase>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) != null) {
    out.push({ attrs: m[1] ?? '', inner: m[2] ?? '' });
  }
  return out;
}

/** Extract <item …/> or <item …></item> from purchase inner XML. */
export function extractItemBlocks(inner: string): string[] {
  const out: string[] = [];
  const re = /<item\b([^>]*?)\s*\/>|<item\b([^>]*)>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) != null) {
    out.push((m[1] ?? m[2] ?? '').trim());
  }
  return out;
}

function parseItemAttrs(attrs: string): ParsedItem | null {
  const product = xmlAttr(attrs, 'product');
  const qty = roundQty(parseAmountInput(xmlAttr(attrs, 'qty')));
  const unitCostPaise = parseMoneyInput(xmlAttr(attrs, 'unitCost'));
  const hsn = xmlAttr(attrs, 'hsn');
  if (!product || !(qty > 0) || !(unitCostPaise > 0)) return null;
  return { product, qty, unitCostPaise, hsn };
}

export function parsePurchasesXml(xml: string): ParsedPurchase[] {
  const purchases: ParsedPurchase[] = [];
  for (const block of extractPurchaseBlocks(xml)) {
    const supplier = xmlAttr(block.attrs, 'supplier');
    const date = xmlAttr(block.attrs, 'date');
    const purchaseNo = xmlAttr(block.attrs, 'purchaseNo');
    const vendorInvoiceNo = xmlAttr(block.attrs, 'vendorInvoiceNo');
    const notes = xmlAttr(block.attrs, 'notes');
    const discountRaw = xmlAttr(block.attrs, 'discount');
    const discountPaise = discountRaw ? parseMoneyInput(discountRaw) : 0;
    const items: ParsedItem[] = [];
    for (const itemAttrs of extractItemBlocks(block.inner)) {
      const item = parseItemAttrs(itemAttrs);
      if (item) items.push(item);
    }
    purchases.push({
      supplier,
      date,
      purchaseNo,
      vendorInvoiceNo,
      notes,
      discountPaise: Number.isFinite(discountPaise) && discountPaise > 0 ? discountPaise : 0,
      items,
    });
  }
  return purchases;
}

async function purchaseExists(invoiceNo: string, date: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM purchases WHERE invoice_no = ? COLLATE NOCASE AND date = ? LIMIT 1',
    [invoiceNo.trim(), date]
  );
  return !!row;
}

async function ensureProductByName(
  name: string,
  unitCostPaise: number,
  hsn: string,
  createdCounter: { n: number }
): Promise<number> {
  const products = await getProducts();
  const existing = products.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (existing) return existing.id;
  const id = await createProduct({
    name: name.trim(),
    category: 'Imported',
    unit: 'pcs',
    opening_qty: 0,
    opening_cost: unitCostPaise > 0 ? unitCostPaise : 0,
    sell_price: unitCostPaise > 0 ? unitCostPaise : undefined,
    hsn_sac: hsn || undefined,
    gst_rate: 0,
  });
  createdCounter.n += 1;
  return id;
}

export async function importPurchasesFromXml(xml: string): Promise<PurchaseImportResult> {
  if (xml.length > PURCHASE_IMPORT_MAX_CHARS) {
    throw new Error('Purchase XML file is too large (max 10 MB).');
  }

  const skipMap = new Map<string, number>();
  const result: PurchaseImportResult = {
    imported: 0,
    vendorsTouched: 0,
    productsCreated: 0,
    skipped: 0,
    skipReasons: [],
    errors: [],
  };
  const skip = (reason: string) => {
    bumpSkip(skipMap, reason);
    result.skipped += 1;
  };
  const productsCreated = { n: 0 };
  const vendorsSeen = new Set<string>();

  const parsed = parsePurchasesXml(xml);
  if (parsed.length === 0) {
    throw new Error('No <purchase> entries found. Use the Hisab purchase sample XML from Settings.');
  }

  for (const row of parsed) {
    const label = row.purchaseNo || row.supplier || '?';
    try {
      if (!row.supplier.trim()) {
        skip('Missing supplier');
        result.errors.push(`Purchase ${label}: supplier is required`);
        continue;
      }
      if (!isValidISODate(row.date)) {
        skip('Invalid or missing date');
        result.errors.push(`Purchase ${label}: date must be YYYY-MM-DD`);
        continue;
      }
      if (row.items.length === 0) {
        skip('No valid line items');
        result.errors.push(`Purchase ${label}: need at least one item with product, qty, unitCost`);
        continue;
      }

      if (row.purchaseNo.trim() && (await purchaseExists(row.purchaseNo, row.date))) {
        skip('Duplicate purchase number');
        continue;
      }

      const vendorKey = row.supplier.trim().toLowerCase();
      if (!vendorsSeen.has(vendorKey)) {
        await upsertParty(row.supplier.trim(), 'vendor');
        vendorsSeen.add(vendorKey);
        result.vendorsTouched += 1;
      }

      const items = [];
      for (const line of row.items) {
        const productId = await ensureProductByName(
          line.product,
          line.unitCostPaise,
          line.hsn,
          productsCreated
        );
        items.push({
          product_id: productId,
          qty: line.qty,
          unit_cost: line.unitCostPaise,
          gst_rate: 0,
          hsn_sac: line.hsn || null,
        });
      }

      await createPurchase({
        supplier_name: row.supplier.trim(),
        date: row.date,
        invoice_no: row.purchaseNo.trim() || undefined,
        vendor_invoice_no: row.vendorInvoiceNo.trim() || undefined,
        notes: row.notes.trim() || undefined,
        discount_amount: row.discountPaise > 0 ? row.discountPaise : undefined,
        items,
        payments: [],
      });
      result.imported += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`Purchase ${label}: ${msg}`);
      skip('Import error');
    }
  }

  result.productsCreated = productsCreated.n;
  result.skipReasons = [...skipMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  return result;
}

export function formatPurchaseImportSummary(result: PurchaseImportResult): string {
  const skipParts = result.skipReasons.map((r) => `${r.count} ${r.reason}`);
  const skippedLine =
    result.skipped > 0
      ? `Skipped: ${result.skipped}${skipParts.length ? ` (${skipParts.join(', ')})` : ''}`
      : 'Skipped: 0';
  const errorTail =
    result.errors.length > 0 ? `\n\nIssues:\n${result.errors.slice(0, 5).join('\n')}` : '';
  return [
    `Purchases imported: ${result.imported}`,
    `Vendors touched: ${result.vendorsTouched}`,
    `Products created: ${result.productsCreated}`,
    skippedLine,
  ].join('\n') + errorTail;
}

export async function sharePurchaseImportSampleXml(): Promise<void> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('File system unavailable');
  const dest = `${dir}hisab-purchase-import-sample.xml`;
  await FileSystem.writeAsStringAsync(dest, PURCHASE_IMPORT_SAMPLE_XML, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: 'application/xml',
      dialogTitle: 'Hisab purchase import sample',
      UTI: 'public.xml',
    });
  }
  deferDeleteCacheFile(dest);
}

export async function pickAndImportPurchasesXml(): Promise<PurchaseImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/xml', 'text/xml', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]?.uri) {
    throw new Error('Import cancelled');
  }
  const asset = picked.assets[0];
  if (typeof asset.size === 'number' && asset.size > PURCHASE_IMPORT_MAX_CHARS) {
    throw new Error('Purchase XML file is too large (max 10 MB).');
  }
  const xml = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return importPurchasesFromXml(xml);
}

/** Exported for unit tests */
export const __purchaseXmlTestUtils = {
  xmlAttr,
  extractPurchaseBlocks,
  extractItemBlocks,
  parsePurchasesXml,
};

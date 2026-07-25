import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  getBusinessAddress,
  getBusinessGstin,
  getBusinessName,
  getBusinessState,
  getSelectedFinancialYearStartYear,
} from './appSettings';
import { getParties, upsertParty } from './parties';
import { createSale, getSaleItems, getSales } from './sales';
import { createPurchase, getPurchaseItems, getPurchases } from './purchases';
import { createProduct, getProducts } from './inventory';
import { getDatabase } from '../db/database';
import { makeFinancialYearPeriodKey } from '../utils/date';
import { deferDeleteCacheFile } from '../utils/tempShareFiles';
import type { Party, Purchase, Sale, SaleItem, PurchaseItem } from '../types';

/** Sample Tally XML shipped with the app (also mirrored in assets/tally-sample.xml). */
export const TALLY_SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>Demo Traders</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Acme Stores" RESERVEDNAME="">
      <NAME>Acme Stores</NAME>
      <PARENT>Sundry Debtors</PARENT>
      <GSTIN>29AAAAA0000A1Z5</GSTIN>
      <PRIORSTATENAME>Karnataka</PRIORSTATENAME>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Supply Co" RESERVEDNAME="">
      <NAME>Supply Co</NAME>
      <PARENT>Sundry Creditors</PARENT>
      <GSTIN>27BBBBB0000B1Z2</GSTIN>
      <PRIORSTATENAME>Maharashtra</PRIORSTATENAME>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>20260401</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>S-1001</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Acme Stores</PARTYLEDGERNAME>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>Notebook A5</STOCKITEMNAME>
       <ACTUALQTY>10 pcs</ACTUALQTY>
       <BILLEDQTY>10 pcs</BILLEDQTY>
       <RATE>50/pcs</RATE>
       <AMOUNT>500.00</AMOUNT>
       <GSTOVRDNHSNCODE>482010</GSTOVRDNHSNCODE>
       <GSTOVRDNTAXRATE>12</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Acme Stores</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-560.00</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Purchase" ACTION="Create">
      <DATE>20260402</DATE>
      <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <VOUCHERNUMBER>P-2001</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Supply Co</PARTYLEDGERNAME>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>Notebook A5</STOCKITEMNAME>
       <ACTUALQTY>50 pcs</ACTUALQTY>
       <BILLEDQTY>50 pcs</BILLEDQTY>
       <RATE>30/pcs</RATE>
       <AMOUNT>1500.00</AMOUNT>
       <GSTOVRDNHSNCODE>482010</GSTOVRDNHSNCODE>
       <GSTOVRDNTAXRATE>12</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tallyDate(iso: string): string {
  const clean = iso.replace(/-/g, '');
  return clean.length === 8 ? clean : iso;
}

function fromTallyDate(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  return raw.trim();
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value == null || value === '') return `<${name}></${name}>`;
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function ledgerXml(party: Party): string {
  const parent = party.type === 'vendor' ? 'Sundry Creditors' : 'Sundry Debtors';
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <LEDGER NAME="${escapeXml(party.name)}" RESERVEDNAME="">
  ${tag('NAME', party.name)}
  ${tag('PARENT', parent)}
  ${tag('GSTIN', party.gstin ?? '')}
  ${tag('LEDGERPHONE', party.phone ?? '')}
  ${tag('ADDRESS.LIST', party.address ?? '')}
  ${tag('PRIORSTATENAME', party.state ?? '')}
  <LANGUAGENAME.LIST>
   <NAME.LIST TYPE="String">
    ${tag('NAME', party.name)}
   </NAME.LIST>
  </LANGUAGENAME.LIST>
 </LEDGER>
</TALLYMESSAGE>`;
}

function inventoryLinesXml(
  items: {
    name: string;
    qty: number;
    unit: string;
    rate: number;
    amount: number;
    hsn?: string | null;
    gstRate?: number | null;
  }[]
): string {
  return items
    .map(
      (item) => `<ALLINVENTORYENTRIES.LIST>
  ${tag('STOCKITEMNAME', item.name)}
  ${tag('ISDEEMEDPOSITIVE', 'No')}
  ${tag('ISLASTDEEMEDPOSITIVE', 'No')}
  ${tag('ACTUALQTY', `${item.qty} ${item.unit || 'pcs'}`)}
  ${tag('BILLEDQTY', `${item.qty} ${item.unit || 'pcs'}`)}
  ${tag('RATE', `${item.rate}/${item.unit || 'pcs'}`)}
  ${tag('AMOUNT', item.amount.toFixed(2))}
  ${tag('GSTOVRDNTYPEOFSUPPLY', 'Goods')}
  ${tag('GSTOVRDNTAXABILITY', (item.gstRate ?? 0) > 0 ? 'Taxable' : 'Exempt')}
  ${tag('GSTOVRDNHSNCODE', item.hsn ?? '')}
  ${tag('GSTOVRDNTAXRATE', item.gstRate ?? 0)}
</ALLINVENTORYENTRIES.LIST>`
    )
    .join('\n');
}

function saleVoucherXml(
  sale: Sale,
  items: SaleItem[],
  productNames: Map<number, { name: string; unit: string }>
): string {
  const vchType = sale.invoice_type === 'bos' ? 'Bill of Supply' : 'Sales';
  const lines = items.map((item) => {
    const product = productNames.get(item.product_id);
    return {
      name: product?.name ?? `Item ${item.product_id}`,
      qty: item.qty,
      unit: product?.unit ?? 'pcs',
      rate: item.unit_price,
      amount: item.total,
      hsn: item.hsn_sac,
      gstRate: item.gst_rate,
    };
  });
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
  ${tag('DATE', tallyDate(sale.date))}
  ${tag('VOUCHERTYPENAME', vchType)}
  ${tag('VOUCHERNUMBER', sale.invoice_no)}
  ${tag('REFERENCE', sale.invoice_no)}
  ${tag('PARTYLEDGERNAME', sale.party_name)}
  ${tag('PARTYNAME', sale.party_name)}
  ${tag('PLACEOFSUPPLY', sale.place_of_supply ?? '')}
  ${tag('NARRATION', sale.notes ?? '')}
  ${tag('ISINVOICE', 'Yes')}
  ${inventoryLinesXml(lines)}
  <LEDGERENTRIES.LIST>
   ${tag('LEDGERNAME', sale.party_name)}
   ${tag('ISDEEMEDPOSITIVE', 'Yes')}
   ${tag('AMOUNT', (-sale.total_amount).toFixed(2))}
  </LEDGERENTRIES.LIST>
  <LEDGERENTRIES.LIST>
   ${tag('LEDGERNAME', vchType === 'Bill of Supply' ? 'Sales BOS' : 'Sales')}
   ${tag('ISDEEMEDPOSITIVE', 'No')}
   ${tag('AMOUNT', sale.total_amount.toFixed(2))}
  </LEDGERENTRIES.LIST>
 </VOUCHER>
</TALLYMESSAGE>`;
}

function purchaseVoucherXml(
  purchase: Purchase,
  items: PurchaseItem[],
  productNames: Map<number, { name: string; unit: string }>
): string {
  const lines = items.map((item) => {
    const product = productNames.get(item.product_id);
    return {
      name: product?.name ?? item.product_name ?? `Item ${item.product_id}`,
      qty: item.qty,
      unit: product?.unit ?? 'pcs',
      rate: item.unit_cost,
      amount: item.total,
      hsn: item.hsn_sac,
      gstRate: item.gst_rate,
    };
  });
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
  ${tag('DATE', tallyDate(purchase.date))}
  ${tag('VOUCHERTYPENAME', 'Purchase')}
  ${tag('VOUCHERNUMBER', purchase.invoice_no)}
  ${tag('REFERENCE', purchase.vendor_invoice_no || purchase.invoice_no)}
  ${tag('PARTYLEDGERNAME', purchase.supplier_name)}
  ${tag('PARTYNAME', purchase.supplier_name)}
  ${tag('NARRATION', purchase.notes ?? '')}
  ${tag('ISINVOICE', 'Yes')}
  ${inventoryLinesXml(lines)}
  <LEDGERENTRIES.LIST>
   ${tag('LEDGERNAME', purchase.supplier_name)}
   ${tag('ISDEEMEDPOSITIVE', 'No')}
   ${tag('AMOUNT', purchase.total_amount.toFixed(2))}
  </LEDGERENTRIES.LIST>
  <LEDGERENTRIES.LIST>
   ${tag('LEDGERNAME', 'Purchase')}
   ${tag('ISDEEMEDPOSITIVE', 'Yes')}
   ${tag('AMOUNT', (-purchase.total_amount).toFixed(2))}
  </LEDGERENTRIES.LIST>
 </VOUCHER>
</TALLYMESSAGE>`;
}

export async function buildTallyXml(options?: { periodKey?: string }): Promise<string> {
  const fyStart = await getSelectedFinancialYearStartYear();
  const periodKey = options?.periodKey ?? makeFinancialYearPeriodKey(fyStart);
  const [company, gstin, address, state, parties, sales, purchases, products] = await Promise.all([
    getBusinessName(),
    getBusinessGstin(),
    getBusinessAddress(),
    getBusinessState(),
    getParties('all'),
    getSales('all', { periodKey }),
    getPurchases('all', { periodKey }),
    getProducts(),
  ]);

  const productMap = new Map(
    products.map((p) => [p.id, { name: p.name, unit: p.unit || 'pcs' }] as const)
  );

  const saleBlocks: string[] = [];
  for (const sale of sales) {
    const items = await getSaleItems(sale.id);
    saleBlocks.push(saleVoucherXml(sale, items, productMap));
  }

  const purchaseBlocks: string[] = [];
  for (const purchase of purchases) {
    const items = await getPurchaseItems(purchase.id);
    purchaseBlocks.push(purchaseVoucherXml(purchase, items, productMap));
  }

  const companyName = company.trim() || 'Hisab Company';
  const messages = [
    ...parties.map(ledgerXml),
    ...saleBlocks,
    ...purchaseBlocks,
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     ${tag('SVCURRENTCOMPANY', companyName)}
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <COMPANY>
      ${tag('NAME', companyName)}
      ${tag('GSTIN', gstin)}
      ${tag('ADDRESS', address)}
      ${tag('STATENAME', state)}
      ${tag('BOOKFROM', `${fyStart}0401`)}
     </COMPANY>
    </TALLYMESSAGE>
${messages}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}

export async function exportTallyXmlAndShare(options?: { periodKey?: string }): Promise<{
  path: string;
  sales: number;
  purchases: number;
  parties: number;
}> {
  const xml = await buildTallyXml(options);
  const parties = await getParties('all');
  const fyStart = await getSelectedFinancialYearStartYear();
  const periodKey = options?.periodKey ?? makeFinancialYearPeriodKey(fyStart);
  const [sales, purchases] = await Promise.all([
    getSales('all', { periodKey }),
    getPurchases('all', { periodKey }),
  ]);

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('File system unavailable');
  const fileName = `hisab-tally-${new Date().toISOString().slice(0, 10)}.xml`;
  const path = `${dir}${fileName}`;
  await FileSystem.writeAsStringAsync(path, xml, { encoding: FileSystem.EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/xml',
      dialogTitle: 'Export Tally XML',
      UTI: 'public.xml',
    });
  }
  deferDeleteCacheFile(path);
  return { path, sales: sales.length, purchases: purchases.length, parties: parties.length };
}

export async function shareTallySampleXml(): Promise<void> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('File system unavailable');
  const dest = `${dir}hisab-tally-sample.xml`;
  await FileSystem.writeAsStringAsync(dest, TALLY_SAMPLE_XML, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: 'application/xml',
      dialogTitle: 'Tally sample XML',
      UTI: 'public.xml',
    });
  }
  deferDeleteCacheFile(dest);
}

function extractTag(block: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  const match = block.match(re);
  return match ? decodeXml(match[1].trim()) : '';
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractBlocks(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, 'gi');
  return xml.match(re) ?? [];
}

function parseQty(raw: string): number {
  const match = raw.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseRate(raw: string): number {
  const match = raw.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export interface TallyImportResult {
  partiesCreated: number;
  salesImported: number;
  purchasesImported: number;
  skipped: number;
  errors: string[];
}

async function ensureProductByName(
  name: string,
  rate: number,
  hsn: string,
  gstRate: number
): Promise<number> {
  const products = await getProducts();
  const existing = products.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (existing) return existing.id;
  return createProduct({
    name: name.trim(),
    category: 'Imported',
    unit: 'pcs',
    opening_qty: 0,
    opening_cost: rate > 0 ? rate : 0,
    sell_price: rate > 0 ? rate : undefined,
    hsn_sac: hsn || undefined,
    gst_rate: gstRate,
  });
}

async function saleExists(invoiceNo: string, date: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM sales WHERE invoice_no = ? COLLATE NOCASE AND date = ? LIMIT 1',
    [invoiceNo, date]
  );
  return !!row;
}

async function purchaseExists(invoiceNo: string, date: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM purchases WHERE invoice_no = ? COLLATE NOCASE AND date = ? LIMIT 1',
    [invoiceNo, date]
  );
  return !!row;
}

export async function importTallyXml(xml: string): Promise<TallyImportResult> {
  const result: TallyImportResult = {
    partiesCreated: 0,
    salesImported: 0,
    purchasesImported: 0,
    skipped: 0,
    errors: [],
  };

  const ledgerBlocks = extractBlocks(xml, 'LEDGER');
  for (const block of ledgerBlocks) {
    const name = extractTag(block, 'NAME') || block.match(/NAME="([^"]+)"/i)?.[1] || '';
    if (!name.trim()) continue;
    const parent = extractTag(block, 'PARENT').toLowerCase();
    const type = parent.includes('creditor') ? 'vendor' : 'customer';
    try {
      await upsertParty(name.trim(), type, undefined, extractTag(block, 'LEDGERPHONE') || undefined);
      // Best-effort GSTIN/state update
      const gstin = extractTag(block, 'GSTIN');
      const state = extractTag(block, 'PRIORSTATENAME') || extractTag(block, 'STATENAME');
      if (gstin || state) {
        const db = await getDatabase();
        await db.runAsync(
          `UPDATE parties SET gstin = COALESCE(?, gstin), state = COALESCE(?, state)
           WHERE name = ? COLLATE NOCASE AND type = ?`,
          [gstin || null, state || null, name.trim(), type]
        );
      }
      result.partiesCreated += 1;
    } catch (e) {
      result.errors.push(`Party ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const vouchers = extractBlocks(xml, 'VOUCHER');
  for (const voucher of vouchers) {
    const vchType = (
      extractTag(voucher, 'VOUCHERTYPENAME') ||
      voucher.match(/VCHTYPE="([^"]+)"/i)?.[1] ||
      ''
    ).toLowerCase();
    const date = fromTallyDate(extractTag(voucher, 'DATE'));
    const invoiceNo =
      extractTag(voucher, 'VOUCHERNUMBER') || extractTag(voucher, 'REFERENCE') || '';
    const party =
      extractTag(voucher, 'PARTYLEDGERNAME') || extractTag(voucher, 'PARTYNAME') || '';
    const inventory = extractBlocks(voucher, 'ALLINVENTORYENTRIES.LIST');

    if (!date || !invoiceNo || !party || inventory.length === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const items = [];
      for (const line of inventory) {
        const itemName = extractTag(line, 'STOCKITEMNAME');
        const qty = parseQty(extractTag(line, 'BILLEDQTY') || extractTag(line, 'ACTUALQTY'));
        const rate = parseRate(extractTag(line, 'RATE'));
        const amount = parseRate(extractTag(line, 'AMOUNT'));
        const hsn = extractTag(line, 'GSTOVRDNHSNCODE');
        const gstRate = parseRate(extractTag(line, 'GSTOVRDNTAXRATE'));
        if (!itemName || qty <= 0) continue;
        const unitPrice = rate > 0 ? rate : amount / qty;
        const productId = await ensureProductByName(itemName, unitPrice, hsn, gstRate);
        items.push({
          product_id: productId,
          qty,
          unit_price: unitPrice,
          unit_cost: unitPrice,
          gst_rate: gstRate,
          hsn_sac: hsn || null,
        });
      }
      if (items.length === 0) {
        result.skipped += 1;
        continue;
      }

      if (vchType.includes('purchase')) {
        if (await purchaseExists(invoiceNo, date)) {
          result.skipped += 1;
          continue;
        }
        await createPurchase({
          supplier_name: party,
          date,
          invoice_no: invoiceNo,
          vendor_invoice_no: extractTag(voucher, 'REFERENCE') || undefined,
          items: items.map((i) => ({
            product_id: i.product_id,
            qty: i.qty,
            unit_cost: i.unit_cost,
            gst_rate: i.gst_rate,
            hsn_sac: i.hsn_sac,
          })),
          payments: [],
          notes: extractTag(voucher, 'NARRATION') || undefined,
        });
        result.purchasesImported += 1;
      } else if (
        vchType.includes('sale') ||
        vchType.includes('bill of supply') ||
        vchType.includes('bos')
      ) {
        if (await saleExists(invoiceNo, date)) {
          result.skipped += 1;
          continue;
        }
        const invoiceType =
          vchType.includes('bill of supply') || vchType.includes('bos') ? 'bos' : 'invoice';
        await createSale({
          party_name: party,
          date,
          invoice_no: invoiceNo,
          invoice_type: invoiceType,
          items: items.map((i) => ({
            product_id: i.product_id,
            qty: i.qty,
            unit_price: i.unit_price,
            gst_rate: invoiceType === 'bos' ? 0 : i.gst_rate,
            hsn_sac: i.hsn_sac,
          })),
          payments: [],
          notes: extractTag(voucher, 'NARRATION') || undefined,
        });
        result.salesImported += 1;
      } else {
        result.skipped += 1;
      }
    } catch (e) {
      result.errors.push(
        `Voucher ${invoiceNo || '?'}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return result;
}

export async function pickAndImportTallyXml(): Promise<TallyImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/xml', 'text/xml', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]?.uri) {
    throw new Error('Import cancelled');
  }
  const xml = await FileSystem.readAsStringAsync(picked.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return importTallyXml(xml);
}

/** Exported for unit tests */
export const __tallyXmlTestUtils = {
  escapeXml,
  tallyDate,
  fromTallyDate,
  extractTag,
  extractBlocks,
  parseQty,
  parseRate,
};

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  getBusinessAddress,
  getBusinessGstin,
  getBusinessName,
  getBusinessState,
  getSelectedFinancialYearStartYear,
  setBusinessState,
} from './appSettings';
import { getParties, upsertParty } from './parties';
import { createSale, getSaleItems, getSales } from './sales';
import { createPurchase, getPurchaseItems, getPurchases } from './purchases';
import { createProduct, getProducts } from './inventory';
import {
  createPaymentVoucher,
  getPaymentVoucherAllocations,
  getPaymentVoucherLines,
  getPaymentVouchers,
  paymentVoucherExists,
  planFifoAllocationsAgainstOpenInvoices,
} from './paymentVouchers';
import { getDatabase } from '../db/database';
import { makeFinancialYearPeriodKey } from '../utils/date';
import { deferDeleteCacheFile } from '../utils/tempShareFiles';
import { roundMoney } from '../utils/money';
import type {
  PaymentBillType,
  Party,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
} from '../types';

/** Minimal state helpers for Tally party import (GST math removed). */
function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const cleaned = (gstin ?? '').trim().toUpperCase();
  if (cleaned.length < 2) return null;
  const code = cleaned.slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

function normalizeStateToCode(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) return null;
  if (/^\d{2}$/.test(cleaned)) return cleaned;
  return null;
}

/**
 * Sample Tally XML for Settings → Share sample.
 * Designed for a clean import: 0 skips, 0 errors on a fresh Hisab DB.
 * Covers: party masters, Invoice, Bill of Supply, stock purchase,
 * ledger-only purchase, Receipt (Agst Ref + bank/UPI), Payment (Agst Ref),
 * Receipt Advance, Payment on account.
 * No GST rates (avoids requiring business state). No unsupported voucher types.
 */
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
      <LEDGERPHONE>9876543210</LEDGERPHONE>
      <PRIORSTATENAME>Karnataka</PRIORSTATENAME>
      <ADDRESS>12 MG Road, Bengaluru</ADDRESS>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Supply Co" RESERVEDNAME="">
      <NAME>Supply Co</NAME>
      <PARENT>Sundry Creditors</PARENT>
      <LEDGERPHONE>9123456780</LEDGERPHONE>
      <PRIORSTATENAME>Maharashtra</PRIORSTATENAME>
      <ADDRESS>45 Industrial Estate, Pune</ADDRESS>
     </LEDGER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>20260401</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>S-1001</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Acme Stores</PARTYLEDGERNAME>
      <NARRATION>Sample tax invoice</NARRATION>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>Notebook A5</STOCKITEMNAME>
       <ACTUALQTY>10 pcs</ACTUALQTY>
       <BILLEDQTY>10 pcs</BILLEDQTY>
       <RATE>50/pcs</RATE>
       <AMOUNT>500.00</AMOUNT>
       <GSTOVRDNHSNCODE>482010</GSTOVRDNHSNCODE>
       <GSTOVRDNTAXRATE>0</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Bill of Supply" ACTION="Create">
      <DATE>20260401</DATE>
      <VOUCHERTYPENAME>Bill of Supply</VOUCHERTYPENAME>
      <VOUCHERNUMBER>BOS-1001</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Acme Stores</PARTYLEDGERNAME>
      <NARRATION>Sample bill of supply</NARRATION>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>Plain Register</STOCKITEMNAME>
       <ACTUALQTY>5 pcs</ACTUALQTY>
       <BILLEDQTY>5 pcs</BILLEDQTY>
       <RATE>40/pcs</RATE>
       <AMOUNT>200.00</AMOUNT>
       <GSTOVRDNTAXRATE>0</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Purchase" ACTION="Create">
      <DATE>20260402</DATE>
      <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <VOUCHERNUMBER>900</VOUCHERNUMBER>
      <REFERENCE>VENDOR-900</REFERENCE>
      <PARTYLEDGERNAME>Supply Co</PARTYLEDGERNAME>
      <NARRATION>Sample stock purchase</NARRATION>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>Notebook A5</STOCKITEMNAME>
       <ACTUALQTY>50 pcs</ACTUALQTY>
       <BILLEDQTY>50 pcs</BILLEDQTY>
       <RATE>30/pcs</RATE>
       <AMOUNT>1500.00</AMOUNT>
       <GSTOVRDNTAXRATE>0</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Purchase" ACTION="Create">
      <DATE>20260403</DATE>
      <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <VOUCHERNUMBER>902</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Supply Co</PARTYLEDGERNAME>
      <NARRATION>Sample ledger-only purchase (no stock lines)</NARRATION>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Supply Co</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>2400.00</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Purchase</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-2400.00</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Receipt" ACTION="Create">
      <DATE>20260405</DATE>
      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
      <VOUCHERNUMBER>R-1</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Acme Stores</PARTYLEDGERNAME>
      <NARRATION>Receipt against S-1001</NARRATION>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Acme Stores</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>-500.00</AMOUNT>
       <BILLALLOCATIONS.LIST>
        <NAME>S-1001</NAME>
        <BILLTYPE>Agst Ref</BILLTYPE>
        <AMOUNT>-500.00</AMOUNT>
       </BILLALLOCATIONS.LIST>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>HDFC Bank</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>500.00</AMOUNT>
       <BANKALLOCATIONS.LIST>
        <INSTRUMENTNUMBER>UPI123456</INSTRUMENTNUMBER>
        <BANKNAME>HDFC Bank</BANKNAME>
        <TRANSACTIONTYPE>UPI</TRANSACTIONTYPE>
       </BANKALLOCATIONS.LIST>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Receipt" ACTION="Create">
      <DATE>20260405</DATE>
      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
      <VOUCHERNUMBER>R-2</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Acme Stores</PARTYLEDGERNAME>
      <NARRATION>Advance receipt</NARRATION>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Acme Stores</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>-200.00</AMOUNT>
       <BILLALLOCATIONS.LIST>
        <NAME>Advance</NAME>
        <BILLTYPE>Advance</BILLTYPE>
        <AMOUNT>-200.00</AMOUNT>
       </BILLALLOCATIONS.LIST>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Cash</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>200.00</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Payment" ACTION="Create">
      <DATE>20260406</DATE>
      <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
      <VOUCHERNUMBER>PMT-1</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Supply Co</PARTYLEDGERNAME>
      <NARRATION>Payment against purchase 900</NARRATION>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Supply Co</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>1000.00</AMOUNT>
       <BILLALLOCATIONS.LIST>
        <NAME>900</NAME>
        <BILLTYPE>Agst Ref</BILLTYPE>
        <AMOUNT>1000.00</AMOUNT>
       </BILLALLOCATIONS.LIST>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Cash</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-1000.00</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Payment" ACTION="Create">
      <DATE>20260407</DATE>
      <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
      <VOUCHERNUMBER>PMT-2</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Supply Co</PARTYLEDGERNAME>
      <NARRATION>On-account vendor payment</NARRATION>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Supply Co</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>300.00</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>HDFC Bank</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-300.00</AMOUNT>
       <BANKALLOCATIONS.LIST>
        <INSTRUMENTNUMBER>NEFT7788</INSTRUMENTNUMBER>
        <BANKNAME>HDFC Bank</BANKNAME>
        <TRANSACTIONTYPE>NEFT</TRANSACTIONTYPE>
       </BANKALLOCATIONS.LIST>
      </LEDGERENTRIES.LIST>
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

function fromTallyDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value == null || value === '') return `<${name}></${name}>`;
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

/** Keep voucher numbers as exact strings (e.g. "900", "EGM/004/2026-27"). */
function normalizeVoucherNo(raw: string): string {
  return String(raw ?? '').trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractTag(block: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  const match = block.match(re);
  return match ? decodeXml(match[1].trim()) : '';
}

function extractBlocks(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, 'gi');
  return xml.match(re) ?? [];
}

function parseSignedAmount(raw: string): number {
  const match = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseQty(raw: string): number {
  return Math.abs(parseSignedAmount(raw));
}

function parseRate(raw: string): number {
  return Math.abs(parseSignedAmount(raw));
}

function isYes(raw: string): boolean {
  return raw.trim().toLowerCase() === 'yes';
}

function classifyVoucherType(raw: string):
  | 'sale'
  | 'bos'
  | 'purchase'
  | 'receipt'
  | 'payment'
  | 'unsupported' {
  const t = raw.toLowerCase().trim();
  if (!t) return 'unsupported';
  if (t.includes('receipt')) return 'receipt';
  // After receipt: "Cash Payment" / "Bank Payment" must not fall through.
  if (t.includes('payment')) return 'payment';
  if (t.includes('bill of supply') || t === 'bos' || t.includes('sales-bos')) return 'bos';
  if (t.includes('sale')) return 'sale';
  if (t.includes('purchase')) return 'purchase';
  return 'unsupported';
}

function mapBillType(raw: string): PaymentBillType {
  const t = raw.toLowerCase();
  if (t.includes('agst')) return 'agst_ref';
  if (t.includes('advance')) return 'advance';
  if (t.includes('new')) return 'new_ref';
  return 'on_account';
}

function ledgerXml(party: Party): string {
  const parent = party.type === 'vendor' ? 'Sundry Creditors' : 'Sundry Debtors';
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <LEDGER NAME="${escapeXml(party.name)}" RESERVEDNAME="">
  ${tag('NAME', party.name)}
  ${tag('PARENT', parent)}
  ${tag('GSTIN', party.gstin ?? '')}
  ${tag('LEDGERPHONE', party.phone ?? '')}
  ${tag('PRIORSTATENAME', party.state ?? '')}
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
  ${tag('ACTUALQTY', `${item.qty} ${item.unit || 'pcs'}`)}
  ${tag('BILLEDQTY', `${item.qty} ${item.unit || 'pcs'}`)}
  ${tag('RATE', `${item.rate}/${item.unit || 'pcs'}`)}
  ${tag('AMOUNT', item.amount.toFixed(2))}
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
 <VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create">
  ${tag('DATE', tallyDate(sale.date))}
  ${tag('VOUCHERTYPENAME', vchType)}
  ${tag('VOUCHERNUMBER', sale.invoice_no)}
  ${tag('PARTYLEDGERNAME', sale.party_name)}
  ${tag('NARRATION', sale.notes ?? '')}
  ${inventoryLinesXml(lines)}
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
 <VOUCHER VCHTYPE="Purchase" ACTION="Create">
  ${tag('DATE', tallyDate(purchase.date))}
  ${tag('VOUCHERTYPENAME', 'Purchase')}
  ${tag('VOUCHERNUMBER', purchase.invoice_no)}
  ${tag('REFERENCE', purchase.vendor_invoice_no || purchase.invoice_no)}
  ${tag('PARTYLEDGERNAME', purchase.supplier_name)}
  ${tag('NARRATION', purchase.notes ?? '')}
  ${inventoryLinesXml(lines)}
 </VOUCHER>
</TALLYMESSAGE>`;
}

async function paymentVoucherXml(voucherId: number): Promise<string> {
  const db = await getDatabase();
  const voucher = await db.getFirstAsync<{
    voucher_type: string;
    voucher_no: string;
    date: string;
    party_name: string;
    amount: number;
    narration: string | null;
    instrument_no: string | null;
    instrument_bank: string | null;
    payment_mode: string | null;
  }>('SELECT * FROM payment_vouchers WHERE id = ?', [voucherId]);
  if (!voucher) return '';

  const lines = await getPaymentVoucherLines(voucherId);
  const allocations = await getPaymentVoucherAllocations(voucherId);
  const vchType = voucher.voucher_type === 'receipt' ? 'Receipt' : 'Payment';

  const ledgerBlocks = lines
    .map((line) => {
      const isParty = !!line.is_party;
      const billBlocks =
        isParty && allocations.length > 0
          ? allocations
              .map((a) => {
                const billType =
                  a.bill_type === 'agst_ref'
                    ? 'Agst Ref'
                    : a.bill_type === 'advance'
                      ? 'Advance'
                      : a.bill_type === 'new_ref'
                        ? 'New Ref'
                        : 'On Account';
                const signed =
                  voucher.voucher_type === 'receipt' ? -Math.abs(a.amount) : Math.abs(a.amount);
                return `<BILLALLOCATIONS.LIST>
   ${tag('NAME', a.bill_name)}
   ${tag('BILLTYPE', billType)}
   ${tag('AMOUNT', signed.toFixed(2))}
  </BILLALLOCATIONS.LIST>`;
              })
              .join('\n')
          : '';
      const bankBlock =
        line.is_bank_cash && (voucher.instrument_no || voucher.instrument_bank || voucher.payment_mode)
          ? `<BANKALLOCATIONS.LIST>
   ${tag('INSTRUMENTNUMBER', voucher.instrument_no ?? '')}
   ${tag('BANKNAME', voucher.instrument_bank ?? '')}
   ${tag('TRANSACTIONTYPE', voucher.payment_mode ?? '')}
  </BANKALLOCATIONS.LIST>`
          : '';
      return `<LEDGERENTRIES.LIST>
  ${tag('LEDGERNAME', line.ledger_name)}
  ${tag('ISDEEMEDPOSITIVE', line.is_deemed_positive ? 'Yes' : 'No')}
  ${tag('ISPARTYLEDGER', isParty ? 'Yes' : 'No')}
  ${tag('AMOUNT', line.amount.toFixed(2))}
  ${billBlocks}
  ${bankBlock}
 </LEDGERENTRIES.LIST>`;
    })
    .join('\n');

  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
  ${tag('DATE', tallyDate(voucher.date))}
  ${tag('VOUCHERTYPENAME', vchType)}
  ${tag('VOUCHERNUMBER', voucher.voucher_no)}
  ${tag('PARTYLEDGERNAME', voucher.party_name)}
  ${tag('NARRATION', voucher.narration ?? '')}
  ${ledgerBlocks}
 </VOUCHER>
</TALLYMESSAGE>`;
}

export async function buildTallyXml(options?: { periodKey?: string }): Promise<string> {
  const fyStart = await getSelectedFinancialYearStartYear();
  const periodKey = options?.periodKey ?? makeFinancialYearPeriodKey(fyStart);
  const [company, gstin, address, state, parties, sales, purchases, products, vouchers] =
    await Promise.all([
      getBusinessName(),
      getBusinessGstin(),
      getBusinessAddress(),
      getBusinessState(),
      getParties('all'),
      getSales('all', { periodKey }),
      getPurchases('all', { periodKey }),
      getProducts(),
      getPaymentVouchers({ periodKey }),
    ]);

  const productMap = new Map(
    products.map((p) => [p.id, { name: p.name, unit: p.unit || 'pcs' }] as const)
  );

  const saleBlocks: string[] = [];
  for (const sale of sales) {
    saleBlocks.push(saleVoucherXml(sale, await getSaleItems(sale.id), productMap));
  }
  const purchaseBlocks: string[] = [];
  for (const purchase of purchases) {
    purchaseBlocks.push(purchaseVoucherXml(purchase, await getPurchaseItems(purchase.id), productMap));
  }
  const paymentBlocks: string[] = [];
  for (const voucher of vouchers) {
    paymentBlocks.push(await paymentVoucherXml(voucher.id));
  }

  const companyName = company.trim() || 'Hisab Company';
  const messages = [
    ...parties.map(ledgerXml),
    ...saleBlocks,
    ...purchaseBlocks,
    ...paymentBlocks,
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
  receipts: number;
  payments: number;
  parties: number;
}> {
  const xml = await buildTallyXml(options);
  const parties = await getParties('all');
  const fyStart = await getSelectedFinancialYearStartYear();
  const periodKey = options?.periodKey ?? makeFinancialYearPeriodKey(fyStart);
  const [sales, purchases, receipts, payments] = await Promise.all([
    getSales('all', { periodKey }),
    getPurchases('all', { periodKey }),
    getPaymentVouchers({ periodKey, voucherType: 'receipt' }),
    getPaymentVouchers({ periodKey, voucherType: 'payment' }),
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
  return {
    path,
    sales: sales.length,
    purchases: purchases.length,
    receipts: receipts.length,
    payments: payments.length,
    parties: parties.length,
  };
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

export interface TallySkipReason {
  reason: string;
  count: number;
}

export interface TallyImportResult {
  partiesCreated: number;
  salesImported: number;
  purchasesImported: number;
  receiptsImported: number;
  paymentsImported: number;
  skipped: number;
  skipReasons: TallySkipReason[];
  errors: string[];
}

function bumpSkip(map: Map<string, number>, reason: string) {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

type ImportVoucherKind = 'sale' | 'bos' | 'purchase' | 'receipt' | 'payment';

async function saleExists(
  invoiceNo: string,
  date: string,
  invoiceType: 'invoice' | 'bos'
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM sales
     WHERE invoice_no = ? COLLATE NOCASE AND date = ? AND invoice_type = ?
     LIMIT 1`,
    [normalizeVoucherNo(invoiceNo), date, invoiceType]
  );
  return !!row;
}

async function purchaseExists(invoiceNo: string, date: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM purchases WHERE invoice_no = ? COLLATE NOCASE AND date = ? LIMIT 1',
    [normalizeVoucherNo(invoiceNo), date]
  );
  return !!row;
}

/**
 * Tally duplicate key: (VCHTYPE family, VOUCHERNUMBER, DATE).
 * Receipt #1 and Payment #1 are never duplicates of each other — each voucher
 * type keeps an independent numbering series.
 */
async function importVoucherAlreadyExists(
  kind: ImportVoucherKind,
  voucherNo: string,
  date: string
): Promise<boolean> {
  if (kind === 'receipt' || kind === 'payment') {
    return paymentVoucherExists(kind, voucherNo, date);
  }
  if (kind === 'purchase') {
    return purchaseExists(voucherNo, date);
  }
  return saleExists(voucherNo, date, kind === 'bos' ? 'bos' : 'invoice');
}

function isVoucherDuplicateError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /^Duplicate (receipt|payment) voucher\b/i.test(msg);
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

async function ensureGeneralImportProduct(): Promise<number> {
  return ensureProductByName('Imported (no stock item)', 1, '', 0);
}

async function buildItemsFromInventory(inventory: string[]) {
  const items: {
    product_id: number;
    qty: number;
    unit_price: number;
    unit_cost: number;
    gst_rate: number;
    hsn_sac: string | null;
  }[] = [];
  for (const line of inventory) {
    const itemName = extractTag(line, 'STOCKITEMNAME');
    const qty = parseQty(extractTag(line, 'BILLEDQTY') || extractTag(line, 'ACTUALQTY'));
    const rate = parseRate(extractTag(line, 'RATE'));
    const amount = Math.abs(parseSignedAmount(extractTag(line, 'AMOUNT')));
    const hsn = extractTag(line, 'GSTOVRDNHSNCODE');
    const gstRate = parseRate(extractTag(line, 'GSTOVRDNTAXRATE'));
    if (!itemName || qty <= 0) continue;
    const unitPrice = rate > 0 ? rate : amount / qty;
    if (!(unitPrice > 0)) continue;
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
  return items;
}


function partyAmountFromLedgers(ledgerBlocks: string[], partyName: string): number {
  let total = 0;
  for (const block of ledgerBlocks) {
    const name = extractTag(block, 'LEDGERNAME');
    const isParty =
      isYes(extractTag(block, 'ISPARTYLEDGER')) ||
      name.trim().toLowerCase() === partyName.trim().toLowerCase();
    if (!isParty) continue;
    total = roundMoney(total + Math.abs(parseSignedAmount(extractTag(block, 'AMOUNT'))));
  }
  return total;
}

function detectBankLedger(ledgerBlocks: string[], partyName: string): {
  name: string;
  amount: number;
  instrument_no?: string;
  instrument_bank?: string;
  payment_mode?: string;
} | null {
  for (const block of ledgerBlocks) {
    const name = extractTag(block, 'LEDGERNAME');
    if (!name) continue;
    if (name.trim().toLowerCase() === partyName.trim().toLowerCase()) continue;
    if (isYes(extractTag(block, 'ISPARTYLEDGER'))) continue;
    const lower = name.toLowerCase();
    const looksBank =
      lower.includes('bank') ||
      lower.includes('cash') ||
      lower.includes('upi') ||
      !!extractTag(block, 'BANKALLOCATIONS.LIST') ||
      extractBlocks(block, 'BANKALLOCATIONS.LIST').length > 0;
    if (!looksBank && ledgerBlocks.length > 2) continue;
    const bankAlloc = extractBlocks(block, 'BANKALLOCATIONS.LIST')[0] ?? '';
    return {
      name,
      amount: Math.abs(parseSignedAmount(extractTag(block, 'AMOUNT'))),
      instrument_no: extractTag(bankAlloc, 'INSTRUMENTNUMBER') || undefined,
      instrument_bank: extractTag(bankAlloc, 'BANKNAME') || undefined,
      payment_mode:
        extractTag(bankAlloc, 'TRANSACTIONTYPE') ||
        extractTag(bankAlloc, 'PAYMENTMODE') ||
        undefined,
    };
  }
  // Fallback: first non-party ledger
  for (const block of ledgerBlocks) {
    const name = extractTag(block, 'LEDGERNAME');
    if (!name || name.trim().toLowerCase() === partyName.trim().toLowerCase()) continue;
    if (isYes(extractTag(block, 'ISPARTYLEDGER'))) continue;
    return {
      name,
      amount: Math.abs(parseSignedAmount(extractTag(block, 'AMOUNT'))),
    };
  }
  return null;
}

function parseBillAllocations(ledgerBlocks: string[], partyName: string) {
  const allocations: { bill_name: string; bill_type: PaymentBillType; amount: number }[] = [];
  for (const block of ledgerBlocks) {
    const name = extractTag(block, 'LEDGERNAME');
    const isParty =
      isYes(extractTag(block, 'ISPARTYLEDGER')) ||
      name.trim().toLowerCase() === partyName.trim().toLowerCase();
    if (!isParty) continue;
    const bills = extractBlocks(block, 'BILLALLOCATIONS.LIST');
    for (const bill of bills) {
      const billName = extractTag(bill, 'NAME') || 'On Account';
      const billType = mapBillType(extractTag(bill, 'BILLTYPE'));
      const amount = Math.abs(parseSignedAmount(extractTag(bill, 'AMOUNT')));
      if (amount > 0) allocations.push({ bill_name: billName, bill_type: billType, amount });
    }
  }
  return allocations;
}

export async function importTallyXml(xml: string): Promise<TallyImportResult> {
  const skipMap = new Map<string, number>();
  const result: TallyImportResult = {
    partiesCreated: 0,
    salesImported: 0,
    purchasesImported: 0,
    receiptsImported: 0,
    paymentsImported: 0,
    skipped: 0,
    skipReasons: [],
    errors: [],
  };

  const skip = (reason: string) => {
    bumpSkip(skipMap, reason);
    result.skipped += 1;
  };

  const stateVotes = new Map<string, number>();
  const voteState = (code: string | null | undefined) => {
    if (!code) return;
    stateVotes.set(code, (stateVotes.get(code) ?? 0) + 1);
  };

  const ledgerBlocks = extractBlocks(xml, 'LEDGER');
  for (const block of ledgerBlocks) {
    const name = extractTag(block, 'NAME') || block.match(/NAME="([^"]+)"/i)?.[1] || '';
    if (!name.trim()) continue;
    const parent = extractTag(block, 'PARENT').toLowerCase();
    const type = parent.includes('creditor') ? 'vendor' : 'customer';
    try {
      await upsertParty(name.trim(), type, undefined, extractTag(block, 'LEDGERPHONE') || undefined);
      const gstin = extractTag(block, 'GSTIN').trim().toUpperCase() || '';
      const rawState = extractTag(block, 'PRIORSTATENAME') || extractTag(block, 'STATENAME');
      const state =
        normalizeStateToCode(rawState) || (gstin ? stateCodeFromGstin(gstin) : null) || null;
      if (gstin || state) {
        const db = await getDatabase();
        await db.runAsync(
          `UPDATE parties SET gstin = COALESCE(?, gstin), state = COALESCE(?, state)
           WHERE name = ? COLLATE NOCASE AND type = ?`,
          [gstin || null, state, name.trim(), type]
        );
      }
      if (parent.includes('debtor') || parent.includes('creditor')) {
        voteState(state);
      }
      result.partiesCreated += 1;
    } catch (e) {
      result.errors.push(`Party ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Infer business state from the file when Settings is empty (party state / legacy tax splits).
  if (!(await getBusinessState()) && stateVotes.size > 0) {
    let bestCode = '';
    let bestCount = -1;
    for (const [code, count] of stateVotes) {
      if (count > bestCount) {
        bestCode = code;
        bestCount = count;
      }
    }
    if (bestCode) {
      try {
        await setBusinessState(bestCode);
      } catch (e) {
        result.errors.push(
          `Could not set business state from Tally file: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
  }

  const vouchers = extractBlocks(xml, 'VOUCHER');
  for (const voucher of vouchers) {
    const rawType =
      extractTag(voucher, 'VOUCHERTYPENAME') || voucher.match(/VCHTYPE="([^"]+)"/i)?.[1] || '';
    const kind = classifyVoucherType(rawType);
    const dateRaw = extractTag(voucher, 'DATE');
    const date = fromTallyDate(dateRaw);
    const voucherNo = normalizeVoucherNo(
      extractTag(voucher, 'VOUCHERNUMBER') || extractTag(voucher, 'REFERENCE') || ''
    );
    const party =
      extractTag(voucher, 'PARTYLEDGERNAME') || extractTag(voucher, 'PARTYNAME') || '';
    const inventory = extractBlocks(voucher, 'ALLINVENTORYENTRIES.LIST');
    const ledgerEntries = extractBlocks(voucher, 'LEDGERENTRIES.LIST');
    const narration = extractTag(voucher, 'NARRATION') || undefined;

    if (kind === 'unsupported') {
      const label = rawType.trim() || 'Unknown';
      skip(`${label} not supported`);
      continue;
    }

    if (!date) {
      skip(
        kind === 'purchase'
          ? 'Purchases: unparseable date format'
          : kind === 'sale' || kind === 'bos'
            ? 'Sales: unparseable date format'
            : `${kind === 'receipt' ? 'Receipts' : 'Payments'}: unparseable date format`
      );
      continue;
    }
    if (!voucherNo) {
      skip(
        kind === 'purchase'
          ? 'Purchases: missing voucher number'
          : kind === 'sale' || kind === 'bos'
            ? 'Sales: missing voucher number'
            : `${kind === 'receipt' ? 'Receipts' : 'Payments'}: missing voucher number`
      );
      continue;
    }
    if (!party.trim()) {
      skip(
        kind === 'purchase'
          ? 'Purchases: missing party ledger'
          : kind === 'sale' || kind === 'bos'
            ? 'Sales: missing party ledger'
            : `${kind === 'receipt' ? 'Receipts' : 'Payments'}: missing party ledger`
      );
      continue;
    }

    try {
      if (kind === 'receipt' || kind === 'payment') {
        const voucherType = kind;
        if (await importVoucherAlreadyExists(voucherType, voucherNo, date)) {
          skip(
            `${kind === 'receipt' ? 'Receipts' : 'Payments'}: duplicate voucher number`
          );
          continue;
        }
        if (ledgerEntries.length === 0) {
          skip(
            `${kind === 'receipt' ? 'Receipts' : 'Payments'}: missing ledger entries`
          );
          continue;
        }
        const amount = partyAmountFromLedgers(ledgerEntries, party);
        if (!(amount > 0)) {
          skip(
            `${kind === 'receipt' ? 'Receipts' : 'Payments'}: could not parse amount`
          );
          continue;
        }
        const bank = detectBankLedger(ledgerEntries, party);
        let allocations = parseBillAllocations(ledgerEntries, party);
        // Many Tally exports omit BILLALLOCATIONS — without this, every receipt/payment
        // stays "on account" and invoices remain Due even when the party was paid.
        if (allocations.length === 0) {
          allocations = await planFifoAllocationsAgainstOpenInvoices(
            voucherType,
            party.trim(),
            amount
          );
        }
        const lines = ledgerEntries.map((block) => {
          const ledgerName = extractTag(block, 'LEDGERNAME');
          const isParty =
            isYes(extractTag(block, 'ISPARTYLEDGER')) ||
            ledgerName.trim().toLowerCase() === party.trim().toLowerCase();
          const isBank =
            !!bank && ledgerName.trim().toLowerCase() === bank.name.trim().toLowerCase();
          return {
            ledger_name: ledgerName || (isParty ? party : 'Ledger'),
            is_party: isParty,
            is_bank_cash: isBank || (!isParty && ledgerEntries.length <= 2),
            amount: parseSignedAmount(extractTag(block, 'AMOUNT')),
            is_deemed_positive: isYes(extractTag(block, 'ISDEEMEDPOSITIVE')),
          };
        });

        await createPaymentVoucher({
          voucher_type: voucherType,
          voucher_no: voucherNo,
          date,
          party_name: party.trim(),
          party_type: voucherType === 'receipt' ? 'customer' : 'vendor',
          account_name: bank?.name,
          amount,
          narration,
          instrument_no: bank?.instrument_no,
          instrument_bank: bank?.instrument_bank,
          payment_mode: bank?.payment_mode,
          lines,
          allocations,
        });
        if (voucherType === 'receipt') result.receiptsImported += 1;
        else result.paymentsImported += 1;
        continue;
      }

      // Sales / Purchases
      let items = await buildItemsFromInventory(inventory);
      if (items.length === 0) {
        const ledgerAmount = partyAmountFromLedgers(ledgerEntries, party);
        if (ledgerAmount > 0) {
          const productId = await ensureGeneralImportProduct();
          items = [
            {
              product_id: productId,
              qty: 1,
              unit_price: ledgerAmount,
              unit_cost: ledgerAmount,
              gst_rate: 0,
              hsn_sac: null,
            },
          ];
        }
      }
      if (items.length === 0) {
        skip(
          kind === 'purchase'
            ? 'Purchases: no inventory or ledger amount'
            : 'Sales: no inventory or ledger amount'
        );
        continue;
      }

      if (kind === 'purchase') {
        if (await importVoucherAlreadyExists('purchase', voucherNo, date)) {
          skip('Purchases: duplicate voucher number');
          continue;
        }
        await createPurchase({
          supplier_name: party.trim(),
          date,
          invoice_no: voucherNo,
          vendor_invoice_no: extractTag(voucher, 'REFERENCE') || undefined,
          items: items.map((i) => ({
            product_id: i.product_id,
            qty: i.qty,
            unit_cost: i.unit_cost,
            gst_rate: 0,
            hsn_sac: i.hsn_sac,
          })),
          payments: [],
          notes: narration,
        });
        result.purchasesImported += 1;
      } else {
        const invoiceType = kind === 'bos' ? 'bos' : 'invoice';
        if (await importVoucherAlreadyExists(kind, voucherNo, date)) {
          skip('Sales: duplicate voucher number');
          continue;
        }
        await createSale({
          party_name: party.trim(),
          date,
          invoice_no: voucherNo,
          invoice_type: invoiceType,
          items: items.map((i) => ({
            product_id: i.product_id,
            qty: i.qty,
            unit_price: i.unit_price,
            gst_rate: 0,
            hsn_sac: i.hsn_sac,
          })),
          payments: [],
          notes: narration,
        });
        result.salesImported += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`Voucher ${voucherNo || '?'}: ${msg}`);
      if (isVoucherDuplicateError(e)) {
        skip(
          kind === 'receipt'
            ? 'Receipts: duplicate voucher number'
            : kind === 'payment'
              ? 'Payments: duplicate voucher number'
              : kind === 'purchase'
                ? 'Purchases: duplicate voucher number'
                : 'Sales: duplicate voucher number'
        );
      } else {
        skip(
          kind === 'purchase'
            ? `Purchases: import error`
            : kind === 'receipt'
              ? 'Receipts: import error'
              : kind === 'payment'
                ? 'Payments: import error'
                : 'Sales: import error'
        );
      }
    }
  }

  result.skipReasons = [...skipMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  return result;
}

export function formatTallyImportSummary(result: TallyImportResult): string {
  const skipParts = result.skipReasons.map((r) => `${r.count} ${r.reason}`);
  const skippedLine =
    result.skipped > 0
      ? `Skipped: ${result.skipped}${skipParts.length ? ` (${skipParts.join(', ')})` : ''}`
      : 'Skipped: 0';
  const errorTail =
    result.errors.length > 0
      ? `\n\nIssues:\n${result.errors.slice(0, 5).join('\n')}`
      : '';
  return [
    `Parties touched: ${result.partiesCreated}`,
    `Sales: ${result.salesImported}`,
    `Purchases: ${result.purchasesImported}`,
    `Receipts: ${result.receiptsImported}`,
    `Payments: ${result.paymentsImported}`,
    skippedLine,
  ].join('\n') + errorTail;
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
  parseSignedAmount,
  normalizeVoucherNo,
  classifyVoucherType,
  formatTallyImportSummary,
  importVoucherAlreadyExists,
  isVoucherDuplicateError,
};

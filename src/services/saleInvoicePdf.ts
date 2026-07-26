import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getBusinessProfile } from './appSettings';
import { getSaleById, getSaleItems } from './sales';
import { getPartyById } from './parties';
import { formatCurrency } from '../utils/format';
import { formatDisplayDate } from '../utils/date';
import { stateName } from './gst';
import { roundMoney } from '../utils/money';
import { deferDeleteCacheFile } from '../utils/tempShareFiles';
import { savePdfToDevice } from '../utils/pdfExport';
import { sharePdfToWhatsApp } from '../utils/whatsappShare';
import { buildUpiQrDataUri } from '../utils/upiQr';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number): string {
  return formatCurrency(n);
}

function buildUpiQrUrl(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  note: string;
}): { upi: string; qrDataUri: string | null } | null {
  const pa = params.upiId.trim();
  if (!pa) return null;
  const am = params.amount > 0.009 ? params.amount.toFixed(2) : '';
  const query = [
    `pa=${encodeURIComponent(pa)}`,
    `pn=${encodeURIComponent(params.payeeName.slice(0, 50))}`,
    am ? `am=${encodeURIComponent(am)}` : '',
    'cu=INR',
    `tn=${encodeURIComponent(params.note.slice(0, 50))}`,
  ]
    .filter(Boolean)
    .join('&');
  const upi = `upi://pay?${query}`;
  return { upi, qrDataUri: buildUpiQrDataUri(upi) };
}

function amountInWordsInr(amount: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (n: number) => {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${ones[n % 10] ? ` ${ones[n % 10]}` : ''}`.trim();
  };
  const section = (n: number, label: string) => (n > 0 ? `${twoDigits(n)} ${label}` : '');
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = Math.floor((rupees % 1000) / 100);
  const rest = rupees % 100;
  const parts = [
    section(crore, 'Crore'),
    section(lakh, 'Lakh'),
    section(thousand, 'Thousand'),
    hundred > 0 ? `${ones[hundred]} Hundred` : '',
    twoDigits(rest),
  ].filter(Boolean);
  const rupeeWords = parts.length ? `${parts.join(' ')} Rupees` : '';
  const paiseWords = paise > 0 ? ` and ${twoDigits(paise)} Paise` : '';
  return `${rupeeWords}${paiseWords} Only`.replace(/\s+/g, ' ').trim();
}

export async function buildSaleInvoiceHtml(saleId: number): Promise<{
  html: string;
  fileName: string;
  docLabel: string;
  message: string;
  sale: NonNullable<Awaited<ReturnType<typeof getSaleById>>>;
  pdfUriReady?: never;
}> {
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error('Sale not found');
  const [items, profile, party] = await Promise.all([
    getSaleItems(saleId),
    getBusinessProfile(),
    sale.party_id ? getPartyById(sale.party_id) : Promise.resolve(null),
  ]);

  const gstOn = profile.gst_enabled;
  const isBos = gstOn && sale.invoice_type === 'bos';
  const docLabel = !gstOn ? 'Invoice' : isBos ? 'Bill of Supply' : 'Tax Invoice';
  const businessName = profile.business_name || 'Hisab';
  const taxTotal =
    (sale.cgst_amount ?? 0) + (sale.sgst_amount ?? 0) + (sale.igst_amount ?? 0);
  const showTax = gstOn && taxTotal > 0.009;
  const due = roundMoney(Math.max(0, sale.total_amount - sale.paid_amount));
  const taxInclusive = gstOn && profile.tax_inclusive;
  const partyStateLabel =
    gstOn && party?.state
      ? stateName(party.state) || party.state
      : gstOn && sale.place_of_supply
        ? stateName(sale.place_of_supply) || sale.place_of_supply
        : '';

  const qr = buildUpiQrUrl({
    upiId: profile.business_upi_id,
    payeeName: businessName,
    amount: due > 0.009 ? due : sale.total_amount,
    note: sale.invoice_no,
  });
  const placeOfSupplyLabel = sale.place_of_supply
    ? `${stateName(sale.place_of_supply) || sale.place_of_supply} (${sale.place_of_supply})`
    : partyStateLabel || '—';
  const words = amountInWordsInr(sale.total_amount);

  const statusLabel = due > 0.009 ? 'Balance due' : 'Paid in full';
  const statusTone = due > 0.009 ? 'due' : 'paid';

  const itemRows = items
    .map((item, index) => {
      const tax =
        (item.cgst_amount ?? 0) + (item.sgst_amount ?? 0) + (item.igst_amount ?? 0);
      const lineAmount = showTax ? (item.taxable_amount ?? item.total) + tax : item.total;
      const zebra = index % 2 === 1 ? ' class="zebra"' : '';
      return `<tr${zebra}>
        <td class="c mono">${index + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(item.product_name ?? String(item.product_id))}</div>
          ${gstOn && item.hsn_sac ? `<div class="hsn">HSN/SAC ${escapeHtml(item.hsn_sac)}</div>` : ''}
        </td>
        <td class="num mono">${item.qty}</td>
        <td class="num mono">${money(item.unit_price)}</td>
        ${gstOn ? `<td class="num mono">${item.gst_rate ?? 0}%</td>` : ''}
        <td class="num mono">${money(item.taxable_amount ?? item.total)}</td>
        ${showTax ? `<td class="num mono">${money(tax)}</td>` : ''}
        <td class="num mono strong">${money(lineAmount)}</td>
      </tr>`;
    })
    .join('');

  const payBlock = qr?.qrDataUri
    ? `<div class="pay-card">
        <div class="pay-title">Pay with UPI</div>
        <img src="${qr.qrDataUri}" alt="UPI QR" width="118" height="118"/>
        <div class="pay-upi mono">${escapeHtml(profile.business_upi_id)}</div>
        ${due > 0.009 ? `<div class="pay-due">Due ${money(due)}</div>` : `<div class="pay-ok">No balance due</div>`}
      </div>`
    : qr
      ? `<div class="pay-card">
          <div class="pay-title">Pay with UPI</div>
          <div class="pay-upi mono" style="margin-top:10px;word-break:break-all">${escapeHtml(profile.business_upi_id)}</div>
          ${due > 0.009 ? `<div class="pay-due">Due ${money(due)}</div>` : `<div class="pay-ok">No balance due</div>`}
        </div>`
      : `<div class="pay-card muted-card">
          <div class="pay-title">Payment</div>
          <div class="pay-note">Add a UPI ID in Settings → Business to show a QR on invoices.</div>
        </div>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { margin: 10mm 10mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    color: #1a2332;
    margin: 0;
    padding: 0;
    line-height: 1.4;
    background: #fff;
  }
  .mono { font-variant-numeric: tabular-nums; }
  .sheet { padding: 0; }

  /* —— Header —— */
  .top-bar {
    height: 5px;
    background: linear-gradient(90deg, #0B1731 0%, #1e3a5f 55%, #c9a227 100%);
    margin: 0 0 18px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 18px;
  }
  .brand-block { flex: 1; min-width: 0; }
  .brand-name {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: 0.4px;
    color: #0B1731;
    margin: 0 0 4px;
    line-height: 1.15;
  }
  .brand-meta {
    font-size: 8.5pt;
    color: #5a6577;
    margin: 0 0 2px;
    max-width: 340px;
  }
  .brand-meta strong { color: #2a3548; font-weight: 600; }
  .doc-badge {
    text-align: right;
    min-width: 200px;
  }
  .doc-type {
    display: inline-block;
    background: #0B1731;
    color: #fff;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    padding: 7px 14px;
    border-radius: 2px;
    margin-bottom: 10px;
  }
  .doc-type.bos { background: #5c4a1f; }
  .inv-no {
    font-size: 13pt;
    font-weight: 700;
    color: #0B1731;
    margin: 0 0 2px;
  }
  .inv-date { font-size: 9pt; color: #5a6577; margin: 0 0 8px; }
  .status-pill {
    display: inline-block;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 999px;
  }
  .status-pill.paid { background: #e6f6ec; color: #0d7a3e; }
  .status-pill.due { background: #fff1e8; color: #b54708; }

  /* —— Parties / meta —— */
  .grid-2 {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }
  .card {
    flex: 1;
    background: #f7f9fc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 14px;
    min-height: 96px;
  }
  .card-label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: #7a8699;
    margin: 0 0 6px;
  }
  .party-name {
    font-size: 11.5pt;
    font-weight: 700;
    color: #0B1731;
    margin: 0 0 4px;
  }
  .card-line { font-size: 8.5pt; color: #3d4a5c; margin: 0 0 2px; }
  .meta-kv { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 5px; font-size: 8.5pt; }
  .meta-kv .k { color: #7a8699; font-weight: 600; }
  .meta-kv .v { color: #1a2332; font-weight: 600; text-align: right; }

  /* —— Items table —— */
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 14px;
    table-layout: fixed;
  }
  table.items thead th {
    background: #0B1731;
    color: #fff;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 8px 6px;
    border: none;
  }
  table.items thead th:first-child { border-radius: 5px 0 0 0; }
  table.items thead th:last-child { border-radius: 0 5px 0 0; }
  table.items td {
    padding: 8px 6px;
    border-bottom: 1px solid #e8edf4;
    vertical-align: top;
    font-size: 9pt;
  }
  table.items tr.zebra td { background: #fafbfd; }
  td.c, th.c { text-align: center; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .item-name { font-weight: 600; color: #1a2332; }
  .hsn { font-size: 7.5pt; color: #7a8699; margin-top: 2px; }
  .strong { font-weight: 700; }

  /* —— Bottom: pay + totals —— */
  .bottom {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: stretch;
    margin-bottom: 12px;
  }
  .pay-card {
    width: 168px;
    text-align: center;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 10px;
    background: #fff;
  }
  .pay-card.muted-card { background: #f7f9fc; }
  .pay-card img {
    width: 118px;
    height: 118px;
    margin: 6px 0;
  }
  .pay-title {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #7a8699;
  }
  .pay-upi { font-size: 8pt; color: #2a3548; font-weight: 600; }
  .pay-due {
    margin-top: 6px;
    font-size: 9pt;
    font-weight: 700;
    color: #b54708;
  }
  .pay-ok {
    margin-top: 6px;
    font-size: 8.5pt;
    font-weight: 600;
    color: #0d7a3e;
  }
  .pay-note { font-size: 8pt; color: #7a8699; margin-top: 10px; line-height: 1.35; }

  .totals {
    width: 280px;
    margin-left: auto;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
  }
  .totals .row {
    display: flex;
    justify-content: space-between;
    padding: 6px 12px;
    font-size: 9pt;
    color: #3d4a5c;
    border-bottom: 1px solid #f0f3f7;
  }
  .totals .row span:last-child { font-weight: 600; color: #1a2332; }
  .totals .row.grand {
    background: #0B1731;
    color: #fff;
    font-size: 11pt;
    font-weight: 700;
    border-bottom: none;
    padding: 10px 12px;
  }
  .totals .row.grand span:last-child { color: #fff; font-weight: 700; }
  .totals .row.due-row span:last-child { color: #b54708; }

  .words {
    background: #f7f9fc;
    border-left: 3px solid #c9a227;
    border-radius: 0 6px 6px 0;
    padding: 10px 12px;
    font-size: 9pt;
    color: #2a3548;
    margin-bottom: 8px;
  }
  .words strong { color: #0B1731; }
  .notes {
    font-size: 8.5pt;
    color: #5a6577;
    padding: 6px 2px 10px;
  }
  .notes strong { color: #2a3548; }

  .footer {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
  }
  .thanks {
    font-size: 9pt;
    color: #5a6577;
    font-style: italic;
  }
  .sign {
    text-align: right;
    min-width: 190px;
  }
  .sign-for {
    font-size: 8.5pt;
    font-weight: 600;
    color: #2a3548;
    margin-bottom: 28px;
  }
  .sign-line {
    border-top: 1px solid #c5ced9;
    padding-top: 6px;
    font-size: 8pt;
    color: #7a8699;
    letter-spacing: 0.3px;
  }
</style></head><body>
<div class="sheet">
  <div class="top-bar"></div>

  <div class="header">
    <div class="brand-block">
      <div class="brand-name">${escapeHtml(businessName)}</div>
      ${profile.business_address ? `<div class="brand-meta">${escapeHtml(profile.business_address)}</div>` : ''}
      ${gstOn && profile.business_gstin ? `<div class="brand-meta"><strong>GSTIN</strong> ${escapeHtml(profile.business_gstin)}</div>` : ''}
      ${
        gstOn && profile.business_state
          ? `<div class="brand-meta"><strong>State</strong> ${escapeHtml(stateName(profile.business_state) || profile.business_state)} (${escapeHtml(profile.business_state)})</div>`
          : ''
      }
    </div>
    <div class="doc-badge">
      <div class="doc-type${isBos ? ' bos' : ''}">${escapeHtml(docLabel)}</div>
      <div class="inv-no mono">${escapeHtml(sale.invoice_no)}</div>
      <div class="inv-date">${escapeHtml(formatDisplayDate(sale.date))}</div>
      <span class="status-pill ${statusTone}">${statusLabel}${due > 0.009 ? ` · ${money(due)}` : ''}</span>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-label">Bill to</div>
      <div class="party-name">${escapeHtml(sale.party_name)}</div>
      ${party?.address ? `<div class="card-line">${escapeHtml(party.address)}</div>` : ''}
      ${gstOn && party?.gstin ? `<div class="card-line"><strong>GSTIN</strong> ${escapeHtml(party.gstin)}</div>` : ''}
      ${partyStateLabel ? `<div class="card-line"><strong>State</strong> ${escapeHtml(partyStateLabel)}</div>` : ''}
      ${party?.phone ? `<div class="card-line"><strong>Phone</strong> ${escapeHtml(party.phone)}</div>` : ''}
    </div>
    <div class="card">
      <div class="card-label">Invoice details</div>
      ${gstOn ? `<div class="meta-kv"><span class="k">Place of supply</span><span class="v">${escapeHtml(placeOfSupplyLabel)}</span></div>` : ''}
      ${gstOn ? `<div class="meta-kv"><span class="k">Reverse charge</span><span class="v">${(sale.is_reverse_charge ?? 0) ? 'Yes' : 'No'}</span></div>` : ''}
      ${taxInclusive && showTax ? `<div class="meta-kv"><span class="k">Pricing</span><span class="v">Tax-inclusive</span></div>` : ''}
      ${gstOn ? `<div class="meta-kv"><span class="k">Taxable</span><span class="v mono">${money(sale.taxable_amount ?? sale.subtotal)}</span></div>` : ''}
      ${showTax ? `<div class="meta-kv"><span class="k">Tax</span><span class="v mono">${money(taxTotal)}</span></div>` : ''}
      <div class="meta-kv"><span class="k">Grand total</span><span class="v mono">${money(sale.total_amount)}</span></div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:28px">#</th>
        <th>Particulars</th>
        <th class="num" style="width:48px">Qty</th>
        <th class="num" style="width:72px">${taxInclusive ? 'Rate (incl.)' : 'Rate'}</th>
        ${gstOn ? '<th class="num" style="width:46px">GST%</th>' : ''}
        <th class="num" style="width:74px">${gstOn ? 'Taxable' : 'Amount'}</th>
        ${showTax ? '<th class="num" style="width:66px">Tax</th>' : ''}
        <th class="num" style="width:80px">${gstOn ? 'Amount' : 'Total'}</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="bottom">
    ${payBlock}
    <div class="totals">
      <div class="row"><span>Subtotal</span><span class="mono">${money(sale.subtotal)}</span></div>
      ${sale.discount_amount > 0 ? `<div class="row"><span>Discount</span><span class="mono">− ${money(sale.discount_amount)}</span></div>` : ''}
      ${gstOn ? `<div class="row"><span>Taxable value</span><span class="mono">${money(sale.taxable_amount ?? sale.subtotal)}</span></div>` : ''}
      ${showTax && (sale.cgst_amount ?? 0) > 0 ? `<div class="row"><span>CGST</span><span class="mono">${money(sale.cgst_amount)}</span></div>` : ''}
      ${showTax && (sale.sgst_amount ?? 0) > 0 ? `<div class="row"><span>SGST</span><span class="mono">${money(sale.sgst_amount)}</span></div>` : ''}
      ${showTax && (sale.igst_amount ?? 0) > 0 ? `<div class="row"><span>IGST</span><span class="mono">${money(sale.igst_amount)}</span></div>` : ''}
      ${(sale.service_charges ?? 0) > 0 ? `<div class="row"><span>Service charges</span><span class="mono">${money(sale.service_charges)}</span></div>` : ''}
      <div class="row grand"><span>Grand Total</span><span class="mono">${money(sale.total_amount)}</span></div>
      ${due > 0.009 ? `<div class="row due-row"><span>Balance due</span><span class="mono">${money(due)}</span></div>` : ''}
    </div>
  </div>

  <div class="words"><strong>Amount in words</strong> · ${escapeHtml(words)}</div>
  ${sale.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(sale.notes)}</div>` : ''}

  <div class="footer">
    <div class="thanks">Thank you for your business.</div>
    <div class="sign">
      <div class="sign-for">For ${escapeHtml(businessName)}</div>
      <div class="sign-line">Authorised Signatory</div>
    </div>
  </div>
</div>
</body></html>`;

  const message = profile.whatsapp_message_template
    .replace(/\{party\}/gi, sale.party_name)
    .replace(/\{invoice_no\}/gi, sale.invoice_no)
    .replace(/\{amount\}/gi, formatCurrency(sale.total_amount))
    .replace(/\{doc_type\}/gi, docLabel);

  const fileName = `${!gstOn ? 'Invoice' : isBos ? 'BOS' : 'Tax-Invoice'}-${sale.invoice_no.replace(/[^\w-]/g, '_')}.pdf`;
  return { html, fileName, docLabel, message, sale };
}

async function writeInvoicePdfFile(saleId: number): Promise<{
  dest: string;
  fileName: string;
  docLabel: string;
  message: string;
  sale: NonNullable<Awaited<ReturnType<typeof getSaleById>>>;
  partyPhone: string;
}> {
  const built = await buildSaleInvoiceHtml(saleId);
  const { uri } = await Print.printToFileAsync({ html: built.html });
  // Unique cache name avoids Android file-lock races on rapid re-share.
  const stamp = Date.now();
  const dest = `${FileSystem.cacheDirectory}${stamp}-${built.fileName}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists || (typeof info.size === 'number' && info.size < 32)) {
    throw new Error('Failed to create invoice PDF');
  }
  const party = built.sale.party_id ? await getPartyById(built.sale.party_id) : null;
  return {
    dest,
    fileName: built.fileName,
    docLabel: built.docLabel,
    message: built.message,
    sale: built.sale,
    partyPhone: party?.phone || '',
  };
}

export async function shareSaleInvoicePdf(saleId: number): Promise<void> {
  const { dest, docLabel, message, partyPhone } = await writeInvoicePdfFile(saleId);
  // When the customer has a phone, open WhatsApp with PDF + message on their chat.
  if (partyPhone?.trim()) {
    await sharePdfToWhatsApp({
      fileUri: dest,
      phone: partyPhone,
      message,
      title: `Share ${docLabel}`,
    });
    deferDeleteCacheFile(dest);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(dest, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${docLabel}`,
    UTI: 'com.adobe.pdf',
  });
  deferDeleteCacheFile(dest);
}

export async function previewSaleInvoicePdf(saleId: number): Promise<void> {
  const { html } = await buildSaleInvoiceHtml(saleId);
  await Print.printAsync({ html });
}

/**
 * Open WhatsApp on the customer's number with invoice PDF attached and message filled.
 */
export async function shareSaleInvoiceWhatsApp(saleId: number): Promise<void> {
  const { dest, docLabel, message, partyPhone } = await writeInvoicePdfFile(saleId);
  try {
    await sharePdfToWhatsApp({
      fileUri: dest,
      phone: partyPhone,
      message,
      title: `Share ${docLabel}`,
    });
  } finally {
    deferDeleteCacheFile(dest);
  }
}

export async function downloadSaleInvoicePdf(
  saleId: number
): Promise<{ success: boolean; message: string }> {
  const { dest, fileName } = await writeInvoicePdfFile(saleId);
  try {
    return await savePdfToDevice(dest, fileName);
  } finally {
    deferDeleteCacheFile(dest);
  }
}

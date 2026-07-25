import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Share } from 'react-native';
import { getBusinessProfile } from './appSettings';
import { getSaleById, getSaleItems } from './sales';
import { getPartyById } from './parties';
import { formatCurrency } from '../utils/format';
import { formatDisplayDate } from '../utils/date';
import { stateName } from './gst';
import { APP_VERSION } from '../constants/appVersion';
import { roundMoney } from '../utils/money';
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

  const isBos = sale.invoice_type === 'bos';
  const docLabel = isBos ? 'Bill of Supply' : 'Tax Invoice';
  const businessName = profile.business_name || 'Hisab';
  const taxTotal =
    (sale.cgst_amount ?? 0) + (sale.sgst_amount ?? 0) + (sale.igst_amount ?? 0);
  const showTax = taxTotal > 0.009;
  const due = roundMoney(Math.max(0, sale.total_amount - sale.paid_amount));
  const taxInclusive = profile.tax_inclusive;
  const partyStateLabel = party?.state
    ? stateName(party.state) || party.state
    : sale.place_of_supply
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

  const itemRows = items
    .map((item, index) => {
      const tax =
        (item.cgst_amount ?? 0) + (item.sgst_amount ?? 0) + (item.igst_amount ?? 0);
      const lineAmount = taxInclusive
        ? (item.taxable_amount ?? item.total) + tax
        : (item.taxable_amount ?? item.total) + tax;
      const rateDisplay = taxInclusive
        ? money(item.unit_price)
        : money(item.unit_price);
      return `<tr>
        <td class="c">${index + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(item.product_name ?? String(item.product_id))}</div>
          ${item.hsn_sac ? `<div class="hsn">HSN ${escapeHtml(item.hsn_sac)}</div>` : ''}
        </td>
        <td class="num">${item.qty}</td>
        <td class="num">${rateDisplay}</td>
        <td class="num">${item.gst_rate ?? 0}%</td>
        <td class="num">${money(item.taxable_amount ?? item.total)}</td>
        ${showTax ? `<td class="num">${money(tax)}</td>` : ''}
        <td class="num strong">${money(lineAmount)}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { margin: 12mm 10mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 9.5pt;
    color: #000;
    margin: 0;
    padding: 0;
    line-height: 1.3;
    background: #fff;
  }
  .company {
    text-align: center;
    font-size: 14pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin: 0 0 2px;
  }
  .company-meta { text-align: center; font-size: 8.5pt; margin-bottom: 2px; }
  .doc-title {
    text-align: center;
    font-size: 12pt;
    font-weight: 700;
    text-transform: uppercase;
    margin: 8px 0 2px;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 4px 0;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 8px 0;
    font-size: 9pt;
  }
  .box {
    flex: 1;
    border: 1px solid #000;
    padding: 6px 8px;
    min-height: 72px;
  }
  .box h3 {
    margin: 0 0 4px;
    font-size: 8pt;
    text-transform: uppercase;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
  }
  .name { font-weight: 700; font-size: 10pt; margin-bottom: 2px; }
  .muted { font-size: 8.5pt; }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    table-layout: fixed;
  }
  table.items th, table.items td {
    border: 1px solid #000;
    padding: 4px 5px;
    vertical-align: top;
  }
  table.items th {
    background: #f0f0f0;
    font-size: 8pt;
    font-weight: 700;
    text-align: center;
  }
  td.c, th.c { text-align: center; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .item-name { font-weight: 700; }
  .hsn { font-size: 8pt; margin-top: 1px; }
  .strong { font-weight: 700; }
  .bottom {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    align-items: flex-start;
  }
  .pay-box {
    width: 150px;
    text-align: center;
    border: 1px solid #000;
    padding: 8px;
  }
  .pay-box img { width: 110px; height: 110px; }
  .pay-box .label { margin-top: 6px; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
  .totals {
    width: 260px;
    margin-left: auto;
    border: 1px solid #000;
  }
  .totals .row {
    display: flex;
    justify-content: space-between;
    padding: 3px 8px;
    border-bottom: 1px solid #ccc;
  }
  .totals .row:last-child { border-bottom: none; }
  .totals .row.grand {
    font-size: 11pt;
    font-weight: 700;
    border-top: 2px solid #000;
    background: #f5f5f5;
    padding: 6px 8px;
  }
  .words {
    margin-top: 10px;
    border: 1px solid #000;
    padding: 6px 8px;
    font-size: 9pt;
  }
  .footer {
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    border-top: 1px solid #999;
    padding-top: 8px;
  }
  .sign { text-align: right; min-width: 180px; }
</style></head><body>
  <div class="company">${escapeHtml(businessName)}</div>
  ${profile.business_address ? `<div class="company-meta">${escapeHtml(profile.business_address)}</div>` : ''}
  ${profile.business_gstin ? `<div class="company-meta"><strong>GSTIN:</strong> ${escapeHtml(profile.business_gstin)}</div>` : ''}
  ${profile.business_state ? `<div class="company-meta">State: ${escapeHtml(stateName(profile.business_state) || profile.business_state)} (${escapeHtml(profile.business_state)})</div>` : ''}

  <div class="doc-title">${escapeHtml(docLabel)}</div>

  <div class="meta-row">
    <div>
      <div><strong>No.:</strong> ${escapeHtml(sale.invoice_no)}</div>
      <div><strong>Date:</strong> ${escapeHtml(formatDisplayDate(sale.date))}</div>
      <div><strong>Place of supply:</strong> ${escapeHtml(placeOfSupplyLabel)}</div>
      <div><strong>Reverse charge:</strong> No</div>
      ${taxInclusive && showTax ? `<div><strong>Pricing:</strong> Tax-inclusive</div>` : ''}
    </div>
    <div style="text-align:right">
      <div><strong>Taxable:</strong> ${money(sale.taxable_amount ?? sale.subtotal)}</div>
      ${showTax ? `<div><strong>Tax:</strong> ${money(taxTotal)}</div>` : ''}
      <div><strong>Grand total:</strong> ${money(sale.total_amount)}</div>
      ${due > 0.009 ? `<div><strong>Balance due:</strong> ${money(due)}</div>` : `<div><strong>Status:</strong> Paid</div>`}
    </div>
  </div>

  <div class="meta-row">
    <div class="box">
      <h3>Party (Bill to)</h3>
      <div class="name">${escapeHtml(sale.party_name)}</div>
      ${party?.address ? `<div class="muted">${escapeHtml(party.address)}</div>` : ''}
      ${party?.gstin ? `<div class="muted">GSTIN: ${escapeHtml(party.gstin)}</div>` : ''}
      ${partyStateLabel ? `<div class="muted">State: ${escapeHtml(partyStateLabel)}</div>` : ''}
      ${party?.phone ? `<div class="muted">Phone: ${escapeHtml(party.phone)}</div>` : ''}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:28px">#</th>
        <th>Particulars</th>
        <th class="num" style="width:48px">Qty</th>
        <th class="num" style="width:70px">${taxInclusive ? 'Rate (incl.)' : 'Rate'}</th>
        <th class="num" style="width:44px">GST%</th>
        <th class="num" style="width:72px">Taxable</th>
        ${showTax ? '<th class="num" style="width:64px">Tax</th>' : ''}
        <th class="num" style="width:78px">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="bottom">
    ${
      qr?.qrDataUri
        ? `<div class="pay-box">
            <img src="${qr.qrDataUri}" alt="UPI QR" width="110" height="110"/>
            <div class="label">Scan to pay</div>
            <div class="muted">${escapeHtml(profile.business_upi_id)}</div>
            ${due > 0.009 ? `<div class="muted">Due ${money(due)}</div>` : ''}
          </div>`
        : qr
          ? `<div class="pay-box">
              <div class="label">Pay via UPI</div>
              <div class="muted" style="margin-top:6px;word-break:break-all">${escapeHtml(profile.business_upi_id)}</div>
              ${due > 0.009 ? `<div class="muted">Due ${money(due)}</div>` : ''}
            </div>`
          : `<div style="flex:1"></div>`
    }
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
      ${sale.discount_amount > 0 ? `<div class="row"><span>Discount</span><span>− ${money(sale.discount_amount)}</span></div>` : ''}
      <div class="row"><span>Taxable value</span><span>${money(sale.taxable_amount ?? sale.subtotal)}</span></div>
      ${showTax && (sale.cgst_amount ?? 0) > 0 ? `<div class="row"><span>CGST</span><span>${money(sale.cgst_amount)}</span></div>` : ''}
      ${showTax && (sale.sgst_amount ?? 0) > 0 ? `<div class="row"><span>SGST</span><span>${money(sale.sgst_amount)}</span></div>` : ''}
      ${showTax && (sale.igst_amount ?? 0) > 0 ? `<div class="row"><span>IGST</span><span>${money(sale.igst_amount)}</span></div>` : ''}
      ${(sale.service_charges ?? 0) > 0 ? `<div class="row"><span>Service charges</span><span>${money(sale.service_charges)}</span></div>` : ''}
      <div class="row grand"><span>Grand Total</span><span>${money(sale.total_amount)}</span></div>
    </div>
  </div>

  <div class="words"><strong>Amount in words:</strong> ${escapeHtml(words)}</div>
  ${sale.notes ? `<div class="words"><strong>Notes:</strong> ${escapeHtml(sale.notes)}</div>` : ''}

  <div class="footer">
    <span>Hisab v${APP_VERSION}</span>
    <div class="sign">
      <div>For ${escapeHtml(businessName)}</div>
      <div style="margin-top:28px">Authorised Signatory</div>
    </div>
  </div>
</body></html>`;

  const message = profile.whatsapp_message_template
    .replace(/\{party\}/gi, sale.party_name)
    .replace(/\{invoice_no\}/gi, sale.invoice_no)
    .replace(/\{amount\}/gi, formatCurrency(sale.total_amount))
    .replace(/\{doc_type\}/gi, docLabel);

  const fileName = `${isBos ? 'BOS' : 'Tax-Invoice'}-${sale.invoice_no.replace(/[^\w-]/g, '_')}.pdf`;
  return { html, fileName, docLabel, message, sale };
}

async function writeInvoicePdfFile(saleId: number): Promise<{
  dest: string;
  docLabel: string;
  message: string;
  sale: NonNullable<Awaited<ReturnType<typeof getSaleById>>>;
  partyPhone: string;
}> {
  const built = await buildSaleInvoiceHtml(saleId);
  const { uri } = await Print.printToFileAsync({ html: built.html });
  const dest = `${FileSystem.cacheDirectory}${built.fileName}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  const party = built.sale.party_id ? await getPartyById(built.sale.party_id) : null;
  return {
    dest,
    docLabel: built.docLabel,
    message: built.message,
    sale: built.sale,
    partyPhone: party?.phone || '',
  };
}

export async function shareSaleInvoicePdf(saleId: number): Promise<void> {
  const { dest, docLabel } = await writeInvoicePdfFile(saleId);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(dest, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${docLabel}`,
    UTI: 'com.adobe.pdf',
  });
}

export async function previewSaleInvoicePdf(saleId: number): Promise<void> {
  const { html } = await buildSaleInvoiceHtml(saleId);
  await Print.printAsync({ html });
}

function normalizeWhatsAppPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Share invoice PDF with WhatsApp message.
 * Prefer PDF share sheet (attachment); include message as dialog title / Share payload.
 */
export async function shareSaleInvoiceWhatsApp(saleId: number): Promise<void> {
  const { dest, docLabel, message, partyPhone } = await writeInvoicePdfFile(saleId);
  const fileUrl = dest.startsWith('file://') ? dest : `file://${dest}`;

  // iOS: message + file URL often arrives together in WhatsApp.
  if (Platform.OS === 'ios') {
    try {
      const result = await Share.share({ message, url: fileUrl, title: docLabel });
      if (result.action !== Share.dismissedAction) return;
    } catch {
      // Fall through.
    }
  }

  // Android & fallback: share the PDF file (actual attachment). Message is in dialog title.
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: 'application/pdf',
      dialogTitle: message.slice(0, 100) || `Share ${docLabel}`,
      UTI: 'com.adobe.pdf',
    });
    return;
  }

  const waPhone = normalizeWhatsAppPhone(partyPhone);
  if (waPhone) {
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return;
    }
  }

  throw new Error('Could not share invoice to WhatsApp');
}

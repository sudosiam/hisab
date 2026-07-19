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
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11.5px;
    color: #15202b;
    margin: 0;
    padding: 0;
    line-height: 1.45;
    background: #fff;
  }
  .shell { border: 1px solid #e6ebf0; border-radius: 10px; overflow: hidden; }
  .accent { height: 6px; background: linear-gradient(90deg, #0f3d2e, #1f7a5c 55%, #c9a227); }
  .pad { padding: 22px 22px 18px; }
  .top {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
    margin-bottom: 18px;
  }
  .brand-name {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0f3d2e;
    margin: 0 0 6px;
  }
  .muted { color: #5b6b7c; font-size: 11px; }
  .pill {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    background: #eef7f2;
    color: #0f3d2e;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .pill.bos { background: #fff6e8; color: #8a5a00; }
  .doc-title { font-size: 18px; font-weight: 700; margin: 8px 0 4px; color: #15202b; }
  .doc-no { font-size: 13px; font-weight: 600; }
  .grid-2 {
    display: flex;
    gap: 16px;
    margin: 8px 0 18px;
  }
  .card {
    flex: 1;
    background: #f7f9fb;
    border: 1px solid #eef1f4;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .card h3 {
    margin: 0 0 6px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #7a8898;
  }
  .card .name { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-top: 4px;
    overflow: hidden;
    border: 1px solid #e6ebf0;
    border-radius: 8px;
  }
  th {
    background: #0f3d2e;
    color: #fff;
    text-align: left;
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 9px 8px;
    font-weight: 600;
  }
  td { padding: 9px 8px; border-top: 1px solid #eef1f4; vertical-align: top; }
  tr:nth-child(even) td { background: #fbfcfd; }
  td.c { text-align: center; color: #7a8898; width: 28px; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .item-name { font-weight: 600; }
  .hsn { color: #7a8898; font-size: 10px; margin-top: 2px; }
  .strong { font-weight: 700; }
  .bottom {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    margin-top: 18px;
    align-items: flex-start;
  }
  .pay-box {
    width: 168px;
    text-align: center;
    border: 1px dashed #cfd8e0;
    border-radius: 10px;
    padding: 12px 10px;
    background: #fcfdfd;
  }
  .pay-box img { width: 120px; height: 120px; }
  .pay-box .label {
    margin-top: 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0f3d2e;
  }
  .totals {
    width: 260px;
    margin-left: auto;
    border: 1px solid #e6ebf0;
    border-radius: 10px;
    padding: 10px 14px;
    background: #fff;
  }
  .totals .row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    color: #3b4a58;
  }
  .totals .row.grand {
    margin-top: 6px;
    padding-top: 8px;
    border-top: 2px solid #0f3d2e;
    font-size: 14px;
    font-weight: 700;
    color: #0f3d2e;
  }
  .notes {
    margin-top: 16px;
    padding: 10px 12px;
    background: #f7f9fb;
    border-radius: 8px;
    color: #5b6b7c;
  }
  .footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #eef1f4;
    display: flex;
    justify-content: space-between;
    color: #9aa6b2;
    font-size: 10px;
  }
</style></head><body>
  <div class="shell">
    <div class="accent"></div>
    <div class="pad">
      <div class="top">
        <div>
          <div class="brand-name">${escapeHtml(businessName)}</div>
          ${profile.business_address ? `<div class="muted">${escapeHtml(profile.business_address)}</div>` : ''}
          ${profile.business_gstin ? `<div class="muted">GSTIN · ${escapeHtml(profile.business_gstin)}</div>` : ''}
          ${profile.business_state ? `<div class="muted">${escapeHtml(stateName(profile.business_state) || profile.business_state)} (${escapeHtml(profile.business_state)})</div>` : ''}
        </div>
        <div style="text-align:right">
          <span class="pill${isBos ? ' bos' : ''}">${escapeHtml(docLabel)}</span>
          <div class="doc-title">${escapeHtml(sale.invoice_no)}</div>
          <div class="muted">Date · ${escapeHtml(formatDisplayDate(sale.date))}</div>
          ${sale.is_inter_state ? `<div class="muted">Place of supply · ${escapeHtml(placeOfSupplyLabel)}</div>` : `<div class="muted">Place of supply · ${escapeHtml(placeOfSupplyLabel)}</div>`}
          <div class="muted">Reverse charge · No</div>
          ${taxInclusive && showTax ? `<div class="muted">Prices are tax-inclusive</div>` : ''}
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Bill to</h3>
          <div class="name">${escapeHtml(sale.party_name)}</div>
          ${party?.address ? `<div class="muted">${escapeHtml(party.address)}</div>` : ''}
          ${party?.gstin ? `<div class="muted">GSTIN · ${escapeHtml(party.gstin)}</div>` : ''}
          ${partyStateLabel ? `<div class="muted">State · ${escapeHtml(partyStateLabel)}</div>` : ''}
          ${party?.phone ? `<div class="muted">Phone · ${escapeHtml(party.phone)}</div>` : ''}
        </div>
        <div class="card">
          <h3>Summary</h3>
          <div class="muted">Taxable · <strong style="color:#15202b">${money(sale.taxable_amount ?? sale.subtotal)}</strong></div>
          ${showTax ? `<div class="muted">Tax · <strong style="color:#15202b">${money(taxTotal)}</strong></div>` : ''}
          <div class="muted" style="margin-top:6px">Grand total · <strong style="color:#0f3d2e;font-size:14px">${money(sale.total_amount)}</strong></div>
          ${due > 0.009 ? `<div class="muted">Amount due · <strong style="color:#a33">${money(due)}</strong></div>` : `<div class="muted">Status · <strong style="color:#1f7a5c">Paid</strong></div>`}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="c">#</th>
            <th>Item</th>
            <th class="num">Qty</th>
            <th class="num">${taxInclusive ? 'Rate (incl.)' : 'Rate'}</th>
            <th class="num">GST</th>
            <th class="num">Taxable</th>
            ${showTax ? '<th class="num">Tax</th>' : ''}
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="bottom">
        ${
          qr?.qrDataUri
            ? `<div class="pay-box">
                <img src="${qr.qrDataUri}" alt="UPI QR" width="120" height="120"/>
                <div class="label">Scan to pay</div>
                <div class="muted" style="margin-top:4px">${escapeHtml(profile.business_upi_id)}</div>
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

      <div class="notes"><strong style="color:#15202b">Amount in words</strong><br/>${escapeHtml(words)}</div>

      ${
        sale.notes
          ? `<div class="notes"><strong style="color:#15202b">Notes</strong><br/>${escapeHtml(sale.notes)}</div>`
          : ''
      }

      <div class="footer">
        <span>For ${escapeHtml(businessName)}<br/><span class="muted">Authorised signatory</span></span>
        <span>Hisab v${APP_VERSION}</span>
      </div>
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

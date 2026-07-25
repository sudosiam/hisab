import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { APP_VERSION } from '../constants/appVersion';
import { formatCurrency, formatIndianMoney, formatSignedCurrency } from '../utils/format';
import { deferDeleteCacheFile } from '../utils/tempShareFiles';
import { getBusinessName } from './appSettings';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safeFilePart(text: string): string {
  return text.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'report';
}

export function pdfMoney(amount: number): string {
  if (!Number.isFinite(amount)) return formatCurrency(0);
  return formatCurrency(amount);
}

export function pdfPlainAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '';
  const plain = formatIndianMoney(Math.abs(amount));
  return amount < 0 ? `(${plain})` : plain;
}

export interface ReportPdfMeta {
  title: string;
  subtitle?: string;
  period?: string;
  companyName?: string;
}

export interface PdfLineItem {
  label: string;
  value: string;
  bold?: boolean;
}

export interface PdfTableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

/** Classic Tally-style report chrome (Times, black rules, centered headers). */
const BASE_CSS = `
  @page { margin: 12mm 10mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 9.5pt;
    color: #000;
    margin: 0;
    padding: 0;
    line-height: 1.3;
  }
  .company {
    text-align: center;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    margin: 0 0 2px;
  }
  .report-title {
    text-align: center;
    font-size: 11pt;
    font-weight: 700;
    margin: 0 0 2px;
    text-transform: uppercase;
  }
  .period {
    text-align: center;
    font-size: 9pt;
    margin: 0 0 8px;
  }
  .subtitle {
    text-align: center;
    font-size: 8.5pt;
    margin: 0 0 8px;
    color: #222;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    margin-bottom: 8px;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 4px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #000;
    padding: 4px 5px;
    vertical-align: top;
    word-wrap: break-word;
  }
  th {
    background: #f0f0f0;
    font-weight: 700;
    text-align: center;
    font-size: 8pt;
  }
  td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.c, th.c { text-align: center; }
  td.l, th.l { text-align: left; }
  tr.total td {
    font-weight: 700;
    background: #f5f5f5;
    border-top: 2px solid #000;
  }
  tr.bold td { font-weight: 700; }
  .lines {
    width: 100%;
    border: 1px solid #000;
    margin-bottom: 12px;
  }
  .line {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    border-bottom: 1px solid #ccc;
    font-size: 9.5pt;
  }
  .line:last-child { border-bottom: none; }
  .line.bold { font-weight: 700; }
  .line.highlight {
    font-size: 10.5pt;
    font-weight: 700;
    background: #f5f5f5;
    border-top: 2px solid #000;
  }
  .section-title {
    font-size: 9.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 12px 0 4px;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
  }
  .empty { color: #333; font-style: italic; padding: 8px 0; text-align: center; }
  .footer {
    margin-top: 14px;
    padding-top: 6px;
    border-top: 1px solid #999;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #333;
  }
`;

export async function wrapReportHtml(meta: ReportPdfMeta, bodyContent: string): Promise<string> {
  const generatedAt = format(new Date(), 'd-MMM-yyyy h:mm a');
  const company =
    (meta.companyName ?? (await getBusinessName()).trim()) || 'Hisab';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="company">${escapeHtml(company)}</div>
  <div class="report-title">${escapeHtml(meta.title)}</div>
  ${meta.period ? `<div class="period">${escapeHtml(meta.period)}</div>` : ''}
  ${meta.subtitle ? `<div class="subtitle">${escapeHtml(meta.subtitle)}</div>` : ''}
  <div class="meta-row">
    <span><strong>Report:</strong> ${escapeHtml(meta.title)}</span>
    <span><strong>Page:</strong> 1</span>
  </div>
  ${bodyContent}
  <div class="footer">
    <span>Generated on ${escapeHtml(generatedAt)}</span>
    <span>Hisab v${escapeHtml(APP_VERSION)}</span>
  </div>
</body>
</html>`;
}

export function buildLinesSection(lines: PdfLineItem[]): string {
  return `<div class="lines">${lines
    .map(
      (line) =>
        `<div class="line${line.bold ? ' bold highlight' : ''}">
          <span>${escapeHtml(line.label)}</span>
          <span>${escapeHtml(line.value)}</span>
        </div>`
    )
    .join('')}</div>`;
}

export function buildTableHtml(
  columns: PdfTableColumn[],
  rows: Record<string, string>[],
  footerRow?: Record<string, string>
): string {
  if (rows.length === 0 && !footerRow) {
    return '<p class="empty">No records for this period.</p>';
  }

  const head = columns
    .map(
      (col) =>
        `<th class="${col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : 'l'}"${
          col.width ? ` style="width:${col.width}"` : ''
        }>${escapeHtml(col.label)}</th>`
    )
    .join('');

  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => {
            const align = col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : 'l';
            return `<td class="${align}">${escapeHtml(row[col.key] ?? '')}</td>`;
          })
          .join('')}</tr>`
    )
    .join('');

  const footer = footerRow
    ? `<tr class="total">${columns
        .map((col) => {
          const align = col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : 'l';
          return `<td class="${align}">${escapeHtml(footerRow[col.key] ?? '')}</td>`;
        })
        .join('')}</tr>`
    : '';

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}${footer}</tbody></table>`;
}

export function buildLedgerTableHtml(
  rows: { date?: string; description: string; debit: number; credit: number; balance?: number }[],
  options?: {
    showDate?: boolean;
    showBalance?: boolean;
    footer?: { label: string; debit: number; credit: number };
  }
): string {
  const showDate = options?.showDate !== false;
  const showBalance = options?.showBalance === true;

  if (rows.length === 0 && !options?.footer) {
    return '<p class="empty">No ledger entries in this range.</p>';
  }

  const head = [
    showDate ? '<th style="width:72px">Date</th>' : '',
    '<th>Particulars</th>',
    '<th class="r" style="width:88px">Debit</th>',
    '<th class="r" style="width:88px">Credit</th>',
    showBalance ? '<th class="r" style="width:88px">Balance</th>' : '',
  ]
    .filter(Boolean)
    .join('');

  const body = rows
    .map(
      (row) =>
        `<tr>
          ${showDate ? `<td class="c">${escapeHtml(row.date ?? '')}</td>` : ''}
          <td class="l">${escapeHtml(row.description)}</td>
          <td class="r">${escapeHtml(pdfPlainAmount(row.debit))}</td>
          <td class="r">${escapeHtml(pdfPlainAmount(row.credit))}</td>
          ${
            showBalance
              ? `<td class="r">${row.balance !== undefined ? escapeHtml(pdfMoney(row.balance)) : ''}</td>`
              : ''
          }
        </tr>`
    )
    .join('');

  const footer = options?.footer
    ? `<tr class="total">
        ${showDate ? '<td></td>' : ''}
        <td class="l">${escapeHtml(options.footer.label)}</td>
        <td class="r">${escapeHtml(pdfPlainAmount(options.footer.debit))}</td>
        <td class="r">${escapeHtml(pdfPlainAmount(options.footer.credit))}</td>
        ${showBalance ? '<td class="r"></td>' : ''}
      </tr>`
    : '';

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}${footer}</tbody></table>`;
}

export { formatSignedCurrency };

export async function shareReportPdf(options: {
  html: string;
  fileName: string;
  dialogTitle: string;
  /** When set, opens WhatsApp on this number with PDF + message. */
  whatsappPhone?: string | null;
  whatsappMessage?: string | null;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: options.html,
      width: 595,
      height: 842,
    });
    const dest = `${FileSystem.cacheDirectory}${options.fileName}`;
    await FileSystem.copyAsync({ from: uri, to: dest });

    if (options.whatsappPhone?.trim() && options.whatsappMessage?.trim()) {
      const { sharePdfToWhatsApp } = await import('../utils/whatsappShare');
      await sharePdfToWhatsApp({
        fileUri: dest,
        phone: options.whatsappPhone,
        message: options.whatsappMessage,
        title: options.dialogTitle,
      });
      deferDeleteCacheFile(dest);
      return { success: true, message: 'Opened WhatsApp with PDF.' };
    }

    if (!(await Sharing.isAvailableAsync())) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      return { success: false, message: 'Sharing is not available on this device.' };
    }

    await Sharing.shareAsync(dest, {
      mimeType: 'application/pdf',
      dialogTitle: options.dialogTitle,
      UTI: 'com.adobe.pdf',
    });
    deferDeleteCacheFile(dest);
    return { success: true, message: 'PDF ready to save or share.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Could not create PDF.',
    };
  }
}

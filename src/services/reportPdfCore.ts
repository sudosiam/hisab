import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { APP_VERSION } from '../constants/appVersion';
import { formatCurrency, formatIndianMoney, formatSignedCurrency } from '../utils/format';

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

const BASE_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    margin: 0;
    padding: 24px 28px 32px;
    line-height: 1.4;
  }
  h1 {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 4px;
    color: #0f2744;
  }
  .meta { color: #555; font-size: 11px; margin-bottom: 16px; }
  .meta span { display: block; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 5px 7px;
    vertical-align: top;
  }
  th {
    background: #eef2f7;
    font-weight: 700;
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  td.r, th.r { text-align: right; }
  td.c, th.c { text-align: center; }
  tr.total td {
    font-weight: 700;
    background: #f5f7fa;
  }
  tr.bold td { font-weight: 700; }
  .lines { margin-bottom: 14px; }
  .line {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px solid #eee;
  }
  .line.bold { font-weight: 700; }
  .line.highlight { font-size: 13px; font-weight: 700; color: #0f2744; }
  .section-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #444;
    margin: 14px 0 6px;
  }
  .empty { color: #777; font-style: italic; padding: 8px 0; }
  .footer {
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #888;
  }
`;

export function wrapReportHtml(meta: ReportPdfMeta, bodyContent: string): string {
  const generatedAt = format(new Date(), 'd MMM yyyy, h:mm a');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${BASE_CSS}</style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="meta">
    ${meta.period ? `<span><strong>Period:</strong> ${escapeHtml(meta.period)}</span>` : ''}
    ${meta.subtitle ? `<span>${escapeHtml(meta.subtitle)}</span>` : ''}
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
        `<th class="${col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : ''}"${
          col.width ? ` style="width:${col.width}"` : ''
        }>${escapeHtml(col.label)}</th>`
    )
    .join('');

  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => {
            const align = col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : '';
            return `<td class="${align}">${escapeHtml(row[col.key] ?? '')}</td>`;
          })
          .join('')}</tr>`
    )
    .join('');

  const footer = footerRow
    ? `<tr class="total">${columns
        .map((col) => {
          const align = col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : '';
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
          ${showDate ? `<td>${escapeHtml(row.date ?? '')}</td>` : ''}
          <td>${escapeHtml(row.description)}</td>
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
        <td>${escapeHtml(options.footer.label)}</td>
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
}): Promise<{ success: boolean; message: string }> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: options.html,
      width: 595,
      height: 842,
    });
    const dest = `${FileSystem.cacheDirectory}${options.fileName}`;
    await FileSystem.copyAsync({ from: uri, to: dest });

    if (!(await Sharing.isAvailableAsync())) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      return { success: false, message: 'Sharing is not available on this device.' };
    }

    await Sharing.shareAsync(dest, {
      mimeType: 'application/pdf',
      dialogTitle: options.dialogTitle,
      UTI: 'com.adobe.pdf',
    });
    await FileSystem.deleteAsync(dest, { idempotent: true });
    return { success: true, message: 'PDF ready to save or share.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Could not create PDF.',
    };
  }
}

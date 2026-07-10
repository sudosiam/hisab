import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { APP_VERSION } from '../constants/appVersion';
import { formatIndianMoney } from '../utils/format';
import { isValidISODate, parseISODate } from '../utils/date';
import { roundMoney } from '../utils/money';
import type { PartyStatementLine, PartyType } from '../types';

export interface PartyStatementPdfInput {
  partyType: PartyType;
  partyName: string;
  partyPhone?: string | null;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  lines: PartyStatementLine[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFilePart(text: string): string {
  return text.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'party';
}

function tallyDate(isoDate: string): string {
  if (!isValidISODate(isoDate)) return isoDate;
  return format(parseISODate(isoDate), 'd-MMM-yyyy');
}

function tallyAmount(amount: number): string {
  if (!amount || !Number.isFinite(amount)) return '';
  const plain = formatIndianMoney(Math.abs(amount));
  return amount < 0 ? `(${plain})` : plain;
}

function tallyBalanceDrCr(partyType: PartyType, amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '0.00';
  const num = tallyAmount(Math.abs(amount));
  if (partyType === 'customer') {
    return amount > 0 ? `${num} Dr` : `${num} Cr`;
  }
  return amount > 0 ? `${num} Cr` : `${num} Dr`;
}

function parseVoucher(partyType: PartyType, line: PartyStatementLine): {
  vchType: string;
  vchNo: string;
  particulars: string;
} {
  if (partyType === 'customer') {
    if (line.reference_type === 'sale') {
      const match = line.description.match(/^(?:Invoice|Bill of Supply)\s+(.+)$/i);
      const vchNo = match?.[1]?.trim() ?? String(line.reference_id);
      const isBos = /^Bill of Supply\b/i.test(line.description);
      return {
        vchType: isBos ? 'BOS' : 'Sales',
        vchNo,
        particulars: line.description,
      };
    }
    if (line.reference_type === 'payment') {
      const match = line.description.match(/^Payment\s+[—-]\s+(.+)$/i);
      const vchNo = match?.[1]?.trim() ?? String(line.reference_id);
      return { vchType: 'Receipt', vchNo, particulars: `By Receipt — ${vchNo}` };
    }
  } else {
    if (line.reference_type === 'purchase') {
      const match = line.description.match(/^Bill\s+(.+)$/i);
      const vchNo = match?.[1]?.trim() ?? String(line.reference_id);
      return { vchType: 'Purchase', vchNo, particulars: line.description };
    }
    if (line.reference_type === 'payment') {
      const match = line.description.match(/^Payment\s+[—-]\s+(.+)$/i);
      const vchNo = match?.[1]?.trim() ?? String(line.reference_id);
      return { vchType: 'Payment', vchNo, particulars: `By Payment — ${vchNo}` };
    }
  }
  return { vchType: '—', vchNo: '—', particulars: line.description };
}

function openingBalanceCells(partyType: PartyType, opening: number): { debit: string; credit: string } {
  if (opening === 0) return { debit: '', credit: '' };
  if (partyType === 'customer') {
    if (opening > 0) return { debit: tallyAmount(opening), credit: '' };
    return { debit: '', credit: tallyAmount(Math.abs(opening)) };
  }
  if (opening > 0) return { debit: '', credit: tallyAmount(opening) };
  return { debit: tallyAmount(Math.abs(opening)), credit: '' };
}

function ledgerGroupLabel(partyType: PartyType, partyName: string): string {
  if (partyType === 'customer') {
    return `Sundry Debtors — ${partyName}`;
  }
  return `Sundry Creditors — ${partyName}`;
}

export function buildPartyStatementHtml(input: PartyStatementPdfInput): string {
  const totalDebit = roundMoney(input.lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundMoney(input.lines.reduce((sum, line) => sum + line.credit, 0));
  const generatedAt = format(new Date(), 'd-MMM-yyyy h:mm a');
  const periodLabel = `${tallyDate(input.fromDate)} to ${tallyDate(input.toDate)}`;
  const openingCells = openingBalanceCells(input.partyType, input.openingBalance);

  const rows = input.lines
    .map((line) => {
      const vch = parseVoucher(input.partyType, line);
      return `
      <tr>
        <td class="c">${escapeHtml(tallyDate(line.date))}</td>
        <td class="l">${escapeHtml(vch.particulars)}</td>
        <td class="c">${escapeHtml(vch.vchType)}</td>
        <td class="c">${escapeHtml(vch.vchNo)}</td>
        <td class="r">${escapeHtml(tallyAmount(line.debit))}</td>
        <td class="r">${escapeHtml(tallyAmount(line.credit))}</td>
        <td class="r bal">${escapeHtml(tallyBalanceDrCr(input.partyType, line.balance))}</td>
      </tr>`;
    })
    .join('');

  const ledgerBody =
    input.lines.length === 0
      ? `<tr>
          <td class="c">${escapeHtml(tallyDate(input.fromDate))}</td>
          <td class="l" colspan="6"><em>No transactions in this period.</em></td>
        </tr>`
      : rows;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { margin: 12mm 10mm; size: A4 portrait; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      color: #000;
      font-size: 9pt;
      line-height: 1.25;
      margin: 0;
    }
    .company {
      text-align: center;
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .report-title {
      text-align: center;
      font-size: 11pt;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .ledger-name {
      text-align: center;
      font-size: 10pt;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .period {
      text-align: center;
      font-size: 9pt;
      margin-bottom: 10px;
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
    table.ledger {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    table.ledger th,
    table.ledger td {
      border: 1px solid #000;
      padding: 4px 5px;
      vertical-align: top;
      word-wrap: break-word;
    }
    table.ledger thead th {
      background: #f0f0f0;
      font-weight: 700;
      font-size: 8pt;
      text-align: center;
    }
    table.ledger td.l { text-align: left; }
    table.ledger td.c { text-align: center; }
    table.ledger td.r {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    table.ledger td.bal { font-weight: 700; }
    table.ledger tr.opening td { font-weight: 700; background: #fafafa; }
    table.ledger tr.total td {
      font-weight: 700;
      border-top: 2px solid #000;
      background: #f5f5f5;
    }
    table.ledger tr.closing td {
      font-weight: 700;
      border-top: 1px solid #000;
      background: #f0f0f0;
    }
    .footer {
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #333;
      border-top: 1px solid #999;
      padding-top: 6px;
    }
    .note {
      margin-top: 10px;
      font-size: 7.5pt;
      color: #444;
    }
  </style>
</head>
<body>
  <div class="company">Hisab</div>
  <div class="report-title">Ledger Account</div>
  <div class="ledger-name">${escapeHtml(input.partyName)}</div>
  <div class="period">${escapeHtml(periodLabel)}</div>

  <div class="meta-row">
    <span><strong>Ledger:</strong> ${escapeHtml(ledgerGroupLabel(input.partyType, input.partyName))}</span>
    <span><strong>Page:</strong> 1</span>
  </div>

  <table class="ledger">
    <colgroup>
      <col style="width:11%" />
      <col style="width:28%" />
      <col style="width:11%" />
      <col style="width:11%" />
      <col style="width:13%" />
      <col style="width:13%" />
      <col style="width:13%" />
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Particulars</th>
        <th>Vch Type</th>
        <th>Vch No.</th>
        <th>Debit</th>
        <th>Credit</th>
        <th>Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening">
        <td class="c">${escapeHtml(tallyDate(input.fromDate))}</td>
        <td class="l">Opening Balance</td>
        <td class="c">—</td>
        <td class="c">—</td>
        <td class="r">${escapeHtml(openingCells.debit)}</td>
        <td class="r">${escapeHtml(openingCells.credit)}</td>
        <td class="r bal">${escapeHtml(tallyBalanceDrCr(input.partyType, input.openingBalance))}</td>
      </tr>
      ${ledgerBody}
      <tr class="total">
        <td class="c" colspan="4">Total</td>
        <td class="r">${escapeHtml(tallyAmount(totalDebit))}</td>
        <td class="r">${escapeHtml(tallyAmount(totalCredit))}</td>
        <td class="r">—</td>
      </tr>
      <tr class="closing">
        <td class="c" colspan="4">Closing Balance</td>
        <td class="r">—</td>
        <td class="r">—</td>
        <td class="r bal">${escapeHtml(tallyBalanceDrCr(input.partyType, input.closingBalance))}</td>
      </tr>
    </tbody>
  </table>

  ${
    input.partyPhone
      ? `<div class="note"><strong>Phone:</strong> ${escapeHtml(input.partyPhone)}</div>`
      : ''
  }

  <div class="footer">
    <span>Generated on ${escapeHtml(generatedAt)}</span>
    <span>Hisab v${escapeHtml(APP_VERSION)} · Tally-style Ledger</span>
  </div>
</body>
</html>`;
}

export async function sharePartyStatementPdf(
  input: PartyStatementPdfInput
): Promise<{ success: boolean; message: string }> {
  try {
    const html = buildPartyStatementHtml(input);
    const { uri } = await Print.printToFileAsync({
      html,
      width: 595,
      height: 842,
    });
    const prefix = input.partyType === 'customer' ? 'Customer-Ledger' : 'Vendor-Ledger';
    const fileName = `${prefix}-${safeFilePart(input.partyName)}-${input.fromDate}-to-${input.toDate}.pdf`;
    const dest = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.copyAsync({ from: uri, to: dest });

    if (!(await Sharing.isAvailableAsync())) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      return { success: false, message: 'Sharing is not available on this device.' };
    }

    await Sharing.shareAsync(dest, {
      mimeType: 'application/pdf',
      dialogTitle: `Download ${input.partyType === 'customer' ? 'Customer' : 'Vendor'} Ledger PDF`,
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

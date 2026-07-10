import type { BalanceSheet } from '../types';
import type { GrowthReport } from './growth';
import type {
  CashFlowReport,
  ExpenseCategoryRow,
  ProfitLossComparison,
  ProfitLossReport,
} from './reports';
import { monthKeyToLabel } from '../utils/date';
import { formatPercent, formatSignedCurrency } from '../utils/format';
import {
  buildLedgerTableHtml,
  buildLinesSection,
  buildTableHtml,
  escapeHtml,
  pdfMoney,
  safeFilePart,
  shareReportPdf,
  wrapReportHtml,
} from './reportPdfCore';

async function exportPdf(html: string, fileName: string, dialogTitle: string) {
  return shareReportPdf({ html, fileName, dialogTitle });
}

export async function shareProfitLossPdf(
  periodKey: string,
  data: ProfitLossReport,
  comparison: ProfitLossComparison | null,
  expenseRows: ExpenseCategoryRow[]
) {
  const period = monthKeyToLabel(periodKey);
  let body = buildLinesSection([
    { label: 'Revenue (Sales)', value: pdfMoney(data.revenue) },
    { label: 'Cost of Goods Sold', value: pdfMoney(-data.cogs) },
    { label: 'Gross Profit', value: pdfMoney(data.grossProfit), bold: true },
    { label: 'Other Income', value: pdfMoney(data.otherIncome) },
    { label: 'Operating Expenses', value: pdfMoney(-data.expenses) },
    { label: 'Net Profit', value: pdfMoney(data.netProfit), bold: true },
  ]);

  if (comparison) {
    body += `<div class="section-title">vs ${escapeHtml(comparison.previousPeriodLabel)}</div>`;
    body += buildLinesSection([
      {
        label: 'Previous net profit',
        value: pdfMoney(comparison.previous.netProfit),
      },
      {
        label: 'Revenue change',
        value: formatSignedCurrency(comparison.change.revenue),
      },
      {
        label: 'Gross profit change',
        value: formatSignedCurrency(comparison.change.grossProfit),
      },
      {
        label: 'Expense change',
        value: formatSignedCurrency(comparison.change.expenses),
      },
      {
        label: 'Net profit change',
        value: formatSignedCurrency(comparison.change.netProfit),
        bold: true,
      },
    ]);
  }

  if (expenseRows.length > 0) {
    body += '<div class="section-title">Expense Breakdown</div>';
    body += buildTableHtml(
      [
        { key: 'category', label: 'Category' },
        { key: 'count', label: 'Entries', align: 'center', width: '64px' },
        { key: 'total', label: 'Amount', align: 'right', width: '96px' },
      ],
      expenseRows.map((row) => ({
        category: row.category,
        count: String(row.count),
        total: pdfMoney(row.total),
      }))
    );
  }

  const html = wrapReportHtml({ title: 'Profit & Loss', period }, body);
  return exportPdf(html, `Profit-Loss-${safeFilePart(period)}.pdf`, 'Download Profit & Loss PDF');
}

export async function shareCashFlowPdf(periodKey: string, data: CashFlowReport) {
  const period = monthKeyToLabel(periodKey);
  const body =
    buildLinesSection([
      { label: 'Opening Cash', value: pdfMoney(data.openingCash) },
      { label: 'Closing Cash', value: pdfMoney(data.closingCash), bold: true },
      { label: 'Net Change', value: pdfMoney(data.netChange), bold: true },
    ]) +
    '<div class="section-title">Operating Activities</div>' +
    buildLinesSection([
      { label: 'Customer Receipts', value: pdfMoney(data.operating.customerReceipts) },
      { label: 'Other Income', value: pdfMoney(data.operating.otherIncome) },
      { label: 'Supplier Payments', value: pdfMoney(-data.operating.supplierPayments) },
      { label: 'Expenses', value: pdfMoney(-data.operating.expenses) },
      { label: 'Net Operating', value: pdfMoney(data.operating.net), bold: true },
    ]) +
    '<div class="section-title">Investing Activities</div>' +
    buildLinesSection([
      { label: 'Fixed Assets Added', value: pdfMoney(-data.investing.fixedAssetsAdded) },
      { label: 'Net Investing', value: pdfMoney(data.investing.net), bold: true },
    ]) +
    '<div class="section-title">Financing Activities</div>' +
    buildLinesSection([
      { label: 'Deposits', value: pdfMoney(data.financing.deposits) },
      { label: 'Withdrawals', value: pdfMoney(-data.financing.withdrawals) },
      { label: 'Net Financing', value: pdfMoney(data.financing.net), bold: true },
    ]);

  const html = wrapReportHtml({ title: 'Cash Flow Statement', period }, body);
  return exportPdf(html, `Cash-Flow-${safeFilePart(period)}.pdf`, 'Download Cash Flow PDF');
}

export async function shareTrialBalancePdf(data: {
  rows: { account: string; debit: number; credit: number }[];
  totalDebit: number;
  totalCredit: number;
}) {
  const balanced = Math.abs(data.totalDebit - data.totalCredit) < 0.02;
  const body =
    buildLedgerTableHtml(
      data.rows.map((row) => ({
        description: row.account,
        debit: row.debit,
        credit: row.credit,
      })),
      {
        showDate: false,
        footer: { label: 'Total', debit: data.totalDebit, credit: data.totalCredit },
      }
    ) +
    `<p class="meta">${
      balanced
        ? 'Books are balanced — total debits equal total credits.'
        : `Difference: ${pdfMoney(Math.abs(data.totalDebit - data.totalCredit))}`
    }</p>`;

  const html = wrapReportHtml(
    { title: 'Trial Balance', subtitle: 'Double-entry snapshot as of today' },
    body
  );
  return exportPdf(html, 'Trial-Balance.pdf', 'Download Trial Balance PDF');
}

export async function shareDayBookPdf(
  fromDate: string,
  toDate: string,
  rows: { date: string; description: string; debit: number; credit: number }[],
  totalDebit: number,
  totalCredit: number
) {
  const period = `${fromDate} to ${toDate}`;
  const body = buildLedgerTableHtml(rows, {
    footer: { label: 'Total', debit: totalDebit, credit: totalCredit },
  });
  const html = wrapReportHtml({ title: 'Day Book', period }, body);
  return exportPdf(
    html,
    `Day-Book-${fromDate}-to-${toDate}.pdf`,
    'Download Day Book PDF'
  );
}

export async function shareGeneralLedgerPdf(
  fromDate: string,
  toDate: string,
  rows: { date: string; accountName: string; description: string; debit: number; credit: number }[]
) {
  const period = `${fromDate} to ${toDate}`;
  const body = buildLedgerTableHtml(
    rows.map((row) => ({
      date: row.date,
      description: `${row.accountName} — ${row.description}`,
      debit: row.debit,
      credit: row.credit,
    })),
    { showDate: true, showBalance: false }
  );
  const html = wrapReportHtml({ title: 'General Ledger', period }, body);
  return exportPdf(
    html,
    `General-Ledger-${fromDate}-to-${toDate}.pdf`,
    'Download General Ledger PDF'
  );
}

export async function shareSalesReportPdf(
  periodKey: string,
  rows: {
    invoice_no: string;
    invoice_type?: string;
    party_name: string;
    date: string;
    status: string;
    total_amount: number;
  }[],
  total: number
) {
  const period = monthKeyToLabel(periodKey);
  const body = buildTableHtml(
    [
      { key: 'invoice', label: 'Document No' },
      { key: 'type', label: 'Type', width: '56px' },
      { key: 'party', label: 'Customer' },
      { key: 'date', label: 'Date', width: '72px' },
      { key: 'status', label: 'Status', width: '64px' },
      { key: 'amount', label: 'Amount', align: 'right', width: '88px' },
    ],
    rows.map((row) => ({
      invoice: row.invoice_no,
      type: row.invoice_type === 'bos' ? 'BOS' : 'Invoice',
      party: row.party_name,
      date: row.date,
      status: row.status,
      amount: pdfMoney(row.total_amount),
    })),
    { invoice: 'Total', type: '', party: '', date: '', status: '', amount: pdfMoney(total) }
  );
  const html = wrapReportHtml({ title: 'Sales Report', period }, body);
  return exportPdf(html, `Sales-${safeFilePart(period)}.pdf`, 'Download Sales Report PDF');
}

export async function sharePurchaseReportPdf(
  periodKey: string,
  rows: { invoice_no: string; supplier_name: string; date: string; status: string; total_amount: number }[],
  total: number
) {
  const period = monthKeyToLabel(periodKey);
  const body = buildTableHtml(
    [
      { key: 'invoice', label: 'Bill' },
      { key: 'party', label: 'Vendor' },
      { key: 'date', label: 'Date', width: '72px' },
      { key: 'status', label: 'Status', width: '64px' },
      { key: 'amount', label: 'Amount', align: 'right', width: '88px' },
    ],
    rows.map((row) => ({
      invoice: row.invoice_no,
      party: row.supplier_name,
      date: row.date,
      status: row.status,
      amount: pdfMoney(row.total_amount),
    })),
    { invoice: 'Total', party: '', date: '', status: '', amount: pdfMoney(total) }
  );
  const html = wrapReportHtml({ title: 'Purchase Report', period }, body);
  return exportPdf(html, `Purchases-${safeFilePart(period)}.pdf`, 'Download Purchase Report PDF');
}

export async function shareInventoryReportPdf(
  rows: { name: string; current_qty: number; avg_cost: number; sell_price: number; value: number }[],
  totalValue: number
) {
  const body = buildTableHtml(
    [
      { key: 'name', label: 'Product' },
      { key: 'qty', label: 'Qty', align: 'right', width: '56px' },
      { key: 'cost', label: 'Avg Cost', align: 'right', width: '80px' },
      { key: 'sell', label: 'Sell Price', align: 'right', width: '80px' },
      { key: 'value', label: 'Value', align: 'right', width: '88px' },
    ],
    rows.map((row) => ({
      name: row.name,
      qty: String(row.current_qty),
      cost: pdfMoney(row.avg_cost),
      sell: pdfMoney(row.sell_price > 0 ? row.sell_price : row.avg_cost * 1.2),
      value: pdfMoney(row.value),
    })),
    { name: 'Total', qty: '', cost: '', sell: '', value: pdfMoney(totalValue) }
  );
  const html = wrapReportHtml(
    { title: 'Inventory Report', subtitle: 'Current stock valuation' },
    body
  );
  return exportPdf(html, 'Inventory-Report.pdf', 'Download Inventory Report PDF');
}

export async function shareReceivablesPdf(
  rows: {
    invoice_no: string;
    invoice_type?: string;
    party_name: string;
    date: string;
    due: number;
  }[],
  total: number
) {
  const body = buildTableHtml(
    [
      { key: 'invoice', label: 'Document No' },
      { key: 'type', label: 'Type', width: '56px' },
      { key: 'party', label: 'Customer' },
      { key: 'date', label: 'Date', width: '72px' },
      { key: 'due', label: 'Due', align: 'right', width: '88px' },
    ],
    rows.map((row) => ({
      invoice: row.invoice_no,
      type: row.invoice_type === 'bos' ? 'BOS' : 'Invoice',
      party: row.party_name,
      date: row.date,
      due: pdfMoney(row.due),
    })),
    { invoice: 'Total Receivable', type: '', party: '', date: '', due: pdfMoney(total) }
  );
  const html = wrapReportHtml(
    { title: 'Receivables', subtitle: 'Outstanding customer dues as of today' },
    body
  );
  return exportPdf(html, 'Receivables.pdf', 'Download Receivables PDF');
}

export async function sharePayablesPdf(
  rows: { invoice_no: string; supplier_name: string; date: string; due: number }[],
  total: number
) {
  const body = buildTableHtml(
    [
      { key: 'invoice', label: 'Bill' },
      { key: 'party', label: 'Vendor' },
      { key: 'date', label: 'Date', width: '72px' },
      { key: 'due', label: 'Due', align: 'right', width: '88px' },
    ],
    rows.map((row) => ({
      invoice: row.invoice_no,
      party: row.supplier_name,
      date: row.date,
      due: pdfMoney(row.due),
    })),
    { invoice: 'Total Payable', party: '', date: '', due: pdfMoney(total) }
  );
  const html = wrapReportHtml(
    { title: 'Payables', subtitle: 'Outstanding vendor dues as of today' },
    body
  );
  return exportPdf(html, 'Payables.pdf', 'Download Payables PDF');
}

export async function shareExpenseCategoriesPdf(
  periodKey: string,
  rows: ExpenseCategoryRow[],
  total: number
) {
  const period = monthKeyToLabel(periodKey);
  const body = buildTableHtml(
    [
      { key: 'category', label: 'Category' },
      { key: 'count', label: 'Entries', align: 'center', width: '64px' },
      { key: 'total', label: 'Amount', align: 'right', width: '96px' },
    ],
    rows.map((row) => ({
      category: row.category,
      count: String(row.count),
      total: pdfMoney(row.total),
    })),
    { category: 'Total Expenses', count: '', total: pdfMoney(total) }
  );
  const html = wrapReportHtml({ title: 'Expenses by Category', period }, body);
  return exportPdf(
    html,
    `Expenses-${safeFilePart(period)}.pdf`,
    'Download Expenses by Category PDF'
  );
}

export async function shareBalanceSheetPdf(data: BalanceSheet) {
  const body =
    buildLinesSection([
      { label: 'Total Assets', value: pdfMoney(data.assets.total), bold: true },
      { label: 'Total Liabilities', value: pdfMoney(data.liabilities.total), bold: true },
      { label: 'Net Worth (Equity)', value: pdfMoney(data.equity), bold: true },
    ]) +
    '<div class="section-title">Assets</div>' +
    buildLinesSection([
      { label: 'Cash & Bank', value: pdfMoney(data.assets.cashAndBank) },
      { label: 'Accounts Receivable', value: pdfMoney(data.assets.receivables) },
      { label: 'Inventory', value: pdfMoney(data.assets.inventory) },
      { label: 'Fixed Assets', value: pdfMoney(data.assets.fixedAssets) },
    ]) +
    '<div class="section-title">Liabilities</div>' +
    buildLinesSection([
      { label: 'Accounts Payable', value: pdfMoney(data.liabilities.payables) },
      { label: 'Loans', value: pdfMoney(data.liabilities.loans) },
    ]);

  const html = wrapReportHtml(
    { title: 'Balance Sheet', subtitle: 'As of today' },
    body
  );
  return exportPdf(html, 'Balance-Sheet.pdf', 'Download Balance Sheet PDF');
}

export async function shareGrowthReportPdf(data: GrowthReport) {
  const snap = data.snapshot;
  let body =
    buildLinesSection([
      { label: 'Net Worth', value: pdfMoney(snap.netWorth), bold: true },
      { label: 'Total Assets', value: pdfMoney(snap.totalAssets) },
      { label: 'Liabilities', value: pdfMoney(snap.liabilities) },
      { label: 'Owner Investment', value: pdfMoney(snap.ownerInvestment) },
      { label: 'Ahead / Behind', value: formatSignedCurrency(snap.aheadBehind) },
      { label: 'Return on Investment', value: formatPercent(snap.returnOnInvestment) },
    ]) +
    '<div class="section-title">Monthly Performance</div>';

  body += buildTableHtml(
    [
      { key: 'month', label: 'Month' },
      { key: 'revenue', label: 'Revenue', align: 'right', width: '80px' },
      { key: 'expenses', label: 'Expenses', align: 'right', width: '80px' },
      { key: 'profit', label: 'Net Profit', align: 'right', width: '88px' },
      { key: 'cumulative', label: 'Cumulative', align: 'right', width: '88px' },
    ],
    data.months.map((row) => ({
      month: row.label,
      revenue: pdfMoney(row.revenue),
      expenses: pdfMoney(row.operatingExpenses + row.cogs),
      profit: pdfMoney(row.netProfit),
      cumulative: pdfMoney(row.cumulativeSurplus),
    }))
  );

  const html = wrapReportHtml(
    {
      title: 'Growth Report',
      period: data.financialYearRangeLabel,
    },
    body
  );
  return exportPdf(
    html,
    `Growth-${safeFilePart(data.financialYearRangeLabel)}.pdf`,
    'Download Growth Report PDF'
  );
}

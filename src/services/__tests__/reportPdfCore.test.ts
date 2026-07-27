import {
  buildLinesSection,
  buildTableHtml,
  escapeHtml,
  pdfMoney,
  pdfPlainAmount,
  safeFilePart,
} from '../reportPdfCore';
import { toPaise } from '../../utils/money';

describe('reportPdfCore helpers', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`A & B <C> "D"`)).toBe('A &amp; B &lt;C&gt; &quot;D&quot;');
  });

  it('builds a safe file name part', () => {
    expect(safeFilePart('P&L / April 2026!!!')).toBe('PL-April-2026');
    expect(safeFilePart('@@@')).toBe('report');
  });

  it('formats money and plain amounts from paise', () => {
    expect(pdfMoney(toPaise(1234.5))).toContain('1,234.50');
    expect(pdfMoney(Number.NaN)).toContain('0.00');
    expect(pdfPlainAmount(0)).toBe('');
    expect(pdfPlainAmount(toPaise(100))).toBe('100.00');
    expect(pdfPlainAmount(toPaise(-50.5))).toBe('(50.50)');
  });

  it('builds line sections and empty tables', () => {
    const lines = buildLinesSection([
      { label: 'Revenue', value: '100.00' },
      { label: 'Net', value: '50.00', bold: true },
    ]);
    expect(lines).toContain('Revenue');
    expect(lines).toContain('bold highlight');

    expect(buildTableHtml([{ key: 'name', label: 'Name' }], [])).toBe(
      '<p class="empty">No records for this period.</p>'
    );
  });

  it('builds table HTML with footer and escaped cells', () => {
    const html = buildTableHtml(
      [
        { key: 'name', label: 'Name' },
        { key: 'amount', label: 'Amount', align: 'right' },
      ],
      [{ name: 'A <B>', amount: '10' }],
      { name: 'Total', amount: '10' }
    );
    expect(html).toContain('<table>');
    expect(html).toContain('A &lt;B&gt;');
    expect(html).toContain('class="total"');
    expect(html).toContain('Total');
  });
});

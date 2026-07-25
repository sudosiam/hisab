import { __tallyXmlTestUtils, TALLY_SAMPLE_XML, formatTallyImportSummary } from '../tallyXml';
import type { TallyImportResult } from '../tallyXml';

const {
  escapeXml,
  tallyDate,
  fromTallyDate,
  extractTag,
  extractBlocks,
  parseQty,
  parseRate,
  normalizeVoucherNo,
  classifyVoucherType,
} = __tallyXmlTestUtils;

describe('tallyXml helpers', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`A & B <C> "D" 'E'`)).toBe('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
  });

  it('converts ISO dates to Tally and back', () => {
    expect(tallyDate('2026-04-01')).toBe('20260401');
    expect(fromTallyDate('20260401')).toBe('2026-04-01');
    expect(fromTallyDate('2026-04-01')).toBe('2026-04-01');
    expect(fromTallyDate('bad')).toBeNull();
  });

  it('keeps numeric voucher numbers as strings', () => {
    expect(normalizeVoucherNo('900')).toBe('900');
    expect(normalizeVoucherNo('EGM/004/2026-27')).toBe('EGM/004/2026-27');
  });

  it('classifies voucher types', () => {
    expect(classifyVoucherType('Purchase')).toBe('purchase');
    expect(classifyVoucherType('Sales')).toBe('sale');
    expect(classifyVoucherType('Bill of Supply')).toBe('bos');
    expect(classifyVoucherType('Receipt')).toBe('receipt');
    expect(classifyVoucherType('Payment')).toBe('payment');
    expect(classifyVoucherType('Contra')).toBe('unsupported');
  });

  it('sample XML contains all supported voucher kinds', () => {
    const vouchers = extractBlocks(TALLY_SAMPLE_XML, 'VOUCHER');
    expect(vouchers.length).toBe(8);
    const types = vouchers.map(
      (v) => extractTag(v, 'VOUCHERTYPENAME') || v.match(/VCHTYPE="([^"]+)"/i)?.[1] || ''
    );
    expect(types).toEqual(
      expect.arrayContaining([
        'Sales',
        'Bill of Supply',
        'Purchase',
        'Receipt',
        'Payment',
      ])
    );
    const purchase900 = vouchers.find((v) => extractTag(v, 'VOUCHERNUMBER') === '900');
    expect(purchase900).toBeTruthy();
    expect(extractBlocks(purchase900!, 'ALLINVENTORYENTRIES.LIST').length).toBe(1);
    const purchase902 = vouchers.find((v) => extractTag(v, 'VOUCHERNUMBER') === '902');
    expect(purchase902).toBeTruthy();
    expect(extractBlocks(purchase902!, 'LEDGERENTRIES.LIST').length).toBeGreaterThan(0);
    expect(parseQty('10 pcs')).toBe(10);
    expect(parseRate('50/pcs')).toBe(50);
  });

  it('formats import summary with skip reasons', () => {
    const result: TallyImportResult = {
      partiesCreated: 2,
      salesImported: 1,
      purchasesImported: 1,
      receiptsImported: 1,
      paymentsImported: 1,
      skipped: 65,
      skipReasons: [
        { reason: 'Receipts not supported', count: 51 },
        { reason: 'Payments not supported', count: 12 },
        { reason: 'Purchases: duplicate voucher number', count: 2 },
      ],
      errors: [],
    };
    const text = formatTallyImportSummary(result);
    expect(text).toContain('Receipts: 1');
    expect(text).toContain('Payments: 1');
    expect(text).toContain('Skipped: 65');
    expect(text).toContain('51 Receipts not supported');
    expect(text).toContain('2 Purchases: duplicate voucher number');
  });
});

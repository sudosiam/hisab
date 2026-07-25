import { __tallyXmlTestUtils, TALLY_SAMPLE_XML } from '../tallyXml';

const { escapeXml, tallyDate, fromTallyDate, extractTag, extractBlocks, parseQty, parseRate } =
  __tallyXmlTestUtils;

describe('tallyXml helpers', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`A & B <C> "D" 'E'`)).toBe('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
  });

  it('converts ISO dates to Tally and back', () => {
    expect(tallyDate('2026-04-01')).toBe('20260401');
    expect(fromTallyDate('20260401')).toBe('2026-04-01');
    expect(fromTallyDate('2026-04-01')).toBe('2026-04-01');
  });

  it('extracts tags and inventory blocks from sample', () => {
    const vouchers = extractBlocks(TALLY_SAMPLE_XML, 'VOUCHER');
    expect(vouchers.length).toBe(2);
    expect(extractTag(vouchers[0], 'VOUCHERNUMBER')).toBe('S-1001');
    expect(extractTag(vouchers[1], 'VOUCHERTYPENAME')).toBe('Purchase');
    const lines = extractBlocks(vouchers[0], 'ALLINVENTORYENTRIES.LIST');
    expect(lines.length).toBe(1);
    expect(extractTag(lines[0], 'STOCKITEMNAME')).toBe('Notebook A5');
    expect(parseQty(extractTag(lines[0], 'BILLEDQTY'))).toBe(10);
    expect(parseRate(extractTag(lines[0], 'RATE'))).toBe(50);
  });
});

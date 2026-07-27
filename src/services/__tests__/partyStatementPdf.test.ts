import { buildPartyStatementHtml } from '../partyStatementPdf';
import type { PartyStatementLine } from '../../types';
import { toPaise } from '../../utils/money';

describe('buildPartyStatementHtml', () => {
  it('renders debit/credit totals and escapes party names', async () => {
    const lines: PartyStatementLine[] = [
      {
        id: '1',
        date: '2026-04-10',
        description: 'Invoice INV-1',
        debit: toPaise(200),
        credit: 0,
        balance: toPaise(200),
        reference_type: 'sale',
        reference_id: 1,
      },
      {
        id: '2',
        date: '2026-04-11',
        description: 'Payment — RCPT-1',
        debit: 0,
        credit: toPaise(50),
        balance: toPaise(150),
        reference_type: 'payment',
        reference_id: 2,
      },
    ];

    const html = await buildPartyStatementHtml({
      partyType: 'customer',
      partyName: 'Buyer <Ltd> & Co',
      partyPhone: null,
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      openingBalance: 0,
      closingBalance: toPaise(150),
      lines,
    });

    expect(html).toContain('Buyer &lt;Ltd&gt; &amp; Co');
    expect(html).toContain('200.00');
    expect(html).toContain('50.00');
    expect(html).toContain('Sales');
    expect(html).toContain('Receipt');
  });
});

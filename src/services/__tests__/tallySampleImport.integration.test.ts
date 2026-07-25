import { initializeFreshDatabase } from '../../db/database';
import { importTallyXml, TALLY_SAMPLE_XML } from '../tallyXml';
import { getSales } from '../sales';
import { getPurchases } from '../purchases';
import { getPaymentVouchers } from '../paymentVouchers';
import { getParties } from '../parties';

describe('TALLY_SAMPLE_XML clean import', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('imports with zero skips and zero errors', async () => {
    const result = await importTallyXml(TALLY_SAMPLE_XML);

    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.skipReasons).toEqual([]);
    expect(result.partiesCreated).toBeGreaterThanOrEqual(2);
    expect(result.salesImported).toBe(2); // Tax Invoice + BOS
    expect(result.purchasesImported).toBe(2); // stock + ledger-only
    expect(result.receiptsImported).toBe(2); // Agst Ref + Advance
    expect(result.paymentsImported).toBe(2); // Agst Ref + on account

    const [parties, sales, purchases, receipts, payments] = await Promise.all([
      getParties('all'),
      getSales('all'),
      getPurchases('all'),
      getPaymentVouchers({ voucherType: 'receipt' }),
      getPaymentVouchers({ voucherType: 'payment' }),
    ]);

    expect(parties.some((p) => p.name === 'Acme Stores' && p.type === 'customer')).toBe(true);
    expect(parties.some((p) => p.name === 'Supply Co' && p.type === 'vendor')).toBe(true);
    expect(sales.some((s) => s.invoice_no === 'S-1001')).toBe(true);
    expect(sales.some((s) => s.invoice_no === 'BOS-1001' && s.invoice_type === 'bos')).toBe(true);
    expect(purchases.some((p) => p.invoice_no === '900')).toBe(true);
    expect(purchases.some((p) => p.invoice_no === '902')).toBe(true);
    expect(receipts).toHaveLength(2);
    expect(payments).toHaveLength(2);
  });
});

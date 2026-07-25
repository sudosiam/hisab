import { existsSync, readFileSync } from 'fs';
import { initializeFreshDatabase } from '../../db/database';
import { getBusinessState } from '../appSettings';
import { importTallyXml } from '../tallyXml';
import { getPaymentVouchers } from '../paymentVouchers';
import { getPurchases } from '../purchases';
import { getSales } from '../sales';

/** Local Tally export used for end-to-end import regression (not checked into git). */
const IFOX_XML = 'c:/Users/biswa/Downloads/ifox-hisab-full.xml';

const describeIfox = existsSync(IFOX_XML) ? describe : describe.skip;

describeIfox('ifox-hisab-full.xml real import', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('imports all vouchers and applies receipts/payments to clear invoice dues', async () => {
    const xml = readFileSync(IFOX_XML, 'utf8');
    const result = await importTallyXml(xml);

    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.salesImported).toBe(38);
    expect(result.purchasesImported).toBe(12);
    expect(result.receiptsImported).toBe(51);
    expect(result.paymentsImported).toBe(12);
    // Inferred from party PRIORSTATENAME (West Bengal) when Settings empty
    expect(await getBusinessState()).toBe('19');

    const [sales, purchases, receipts, payments] = await Promise.all([
      getSales('all'),
      getPurchases('all'),
      getPaymentVouchers({ voucherType: 'receipt' }),
      getPaymentVouchers({ voucherType: 'payment' }),
    ]);
    expect(sales).toHaveLength(38);
    expect(purchases).toHaveLength(12);
    expect(receipts).toHaveLength(51);
    expect(payments).toHaveLength(12);

    // File has no BILLALLOCATIONS — FIFO against open invoices must still clear dues.
    const unpaidSales = sales.filter((s) => s.status === 'unpaid');
    const paidOrPartialSales = sales.filter((s) => s.status === 'paid' || s.status === 'partial');
    expect(paidOrPartialSales.length).toBeGreaterThan(30);
    expect(unpaidSales.length).toBeLessThan(5);

    const unpaidPurchases = purchases.filter((p) => p.status === 'unpaid');
    expect(unpaidPurchases.length).toBeLessThan(purchases.length);
  }, 120000);
});

import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { createProduct } from '../inventory';
import {
  getTrialBalanceFromLedger,
  rebuildGeneralLedger,
  resetLedgerRefreshSchedulerForTests,
} from '../ledger';
import { createPurchase } from '../purchases';
import { createSale } from '../sales';
import { getGstSummary } from '../gstReports';
import { createAdjustmentNote } from '../adjustmentNotes';
import { setBusinessState, setGstEnabled } from '../appSettings';
import { upsertParty } from '../parties';

const TEST_DATE = '2026-04-10';

async function getCashAccountId(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return row.id;
}

describe('golden book — ledger + GST', () => {
  beforeEach(async () => {
    resetLedgerRefreshSchedulerForTests();
    await initializeFreshDatabase();
    await setGstEnabled(true);
    await setBusinessState('27');
  });

  afterEach(() => {
    resetLedgerRefreshSchedulerForTests();
  });

  it('keeps trial balance tied after sale, purchase, and credit note', async () => {
    const cashAccountId = await getCashAccountId();
    await upsertParty('Mumbai Buyer', 'customer', undefined, undefined, { state: '27' });
    await upsertParty('Pune Vendor', 'vendor', undefined, undefined, { state: '27' });

    const productId = await createProduct({
      name: 'Golden Widget',
      opening_qty: 20,
      opening_cost: 40,
      sell_price: 100,
      hsn_sac: '8517',
      gst_rate: 18,
    });

    const saleId = await createSale({
      party_name: 'Mumbai Buyer',
      party_state: '27',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 2, unit_price: 100, gst_rate: 18, hsn_sac: '8517' }],
      payments: [{ account_id: cashAccountId, amount: 236, date: TEST_DATE }],
    });

    await createPurchase({
      supplier_name: 'Pune Vendor',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 5, unit_cost: 40, gst_rate: 18, hsn_sac: '8517' }],
      payments: [{ account_id: cashAccountId, amount: 236, date: TEST_DATE }],
    });

    await createAdjustmentNote({
      note_kind: 'credit',
      direction: 'sale',
      against_sale_id: saleId,
      party_name: 'Mumbai Buyer',
      date: TEST_DATE,
      reason: 'Return one unit',
      items: [{ product_id: productId, qty: 1, unit_price: 100, gst_rate: 18, hsn_sac: '8517' }],
    });

    await rebuildGeneralLedger();

    const tb = await getTrialBalanceFromLedger();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(0.02);

    const summary = await getGstSummary('2026-04');
    // Sale 200 taxable + CN −100 → outward 100 / tax 18; purchase 200 / ITC 36
    expect(summary.outwardTaxable).toBeCloseTo(100, 1);
    expect(summary.outwardTax).toBeCloseTo(18, 1);
    expect(summary.inwardTaxable).toBeCloseTo(200, 1);
    expect(summary.inwardTax).toBeCloseTo(36, 1);
    expect(summary.netPayable).toBeCloseTo(-18, 1);
  });

  it('full rebuild after sale keeps trial balance balanced', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Scoped Item',
      opening_qty: 5,
      opening_cost: 10,
      sell_price: 50,
      gst_rate: 0,
    });

    await createSale({
      party_name: 'Cash Customer',
      date: TEST_DATE,
      invoice_type: 'bos',
      items: [{ product_id: productId, qty: 1, unit_price: 50 }],
      payments: [{ account_id: cashAccountId, amount: 50, date: TEST_DATE }],
    });

    await rebuildGeneralLedger();
    const after = await getTrialBalanceFromLedger();
    expect(Math.abs(after.totalDebit - after.totalCredit)).toBeLessThan(0.02);
  });
});

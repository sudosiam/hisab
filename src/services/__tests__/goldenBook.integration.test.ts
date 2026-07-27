import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { getBalanceSheet } from '../banking';
import { createProduct } from '../inventory';
import {
  awaitPendingLedgerRefresh,
  getTrialBalanceFromLedger,
  rebuildGeneralLedger,
  resetLedgerRefreshSchedulerForTests,
  scheduleGeneralLedgerRefresh,
} from '../ledger';
import { createPurchase } from '../purchases';
import { createSale } from '../sales';
import { createAdjustmentNote } from '../adjustmentNotes';
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

describe('golden book — ledger', () => {
  beforeEach(async () => {
    resetLedgerRefreshSchedulerForTests();
    await initializeFreshDatabase();
  });

  afterEach(() => {
    resetLedgerRefreshSchedulerForTests();
  });

  it('keeps trial balance tied after sale, purchase, and credit note', async () => {
    const cashAccountId = await getCashAccountId();
    await upsertParty('Mumbai Buyer', 'customer');
    await upsertParty('Pune Vendor', 'vendor');

    const productId = await createProduct({
      name: 'Golden Widget',
      opening_qty: 20,
      opening_cost: 40,
      sell_price: 100,
    });

    const saleId = await createSale({
      party_name: 'Mumbai Buyer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 2, unit_price: 100 }],
      payments: [{ account_id: cashAccountId, amount: 200, date: TEST_DATE }],
    });

    await createPurchase({
      supplier_name: 'Pune Vendor',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 5, unit_cost: 40 }],
      payments: [{ account_id: cashAccountId, amount: 200, date: TEST_DATE }],
    });

    await createAdjustmentNote({
      note_kind: 'credit',
      direction: 'sale',
      against_sale_id: saleId,
      party_name: 'Mumbai Buyer',
      date: TEST_DATE,
      reason: 'Return one unit',
      items: [{ product_id: productId, qty: 1, unit_price: 100 }],
    });

    await rebuildGeneralLedger();

    const tb = await getTrialBalanceFromLedger();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(0.02);
  });

  it('full rebuild after sale keeps trial balance balanced', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Scoped Item',
      opening_qty: 5,
      opening_cost: 10,
      sell_price: 50,
    });

    await createSale({
      party_name: 'Walk-in',
      date: TEST_DATE,
      invoice_type: 'bos',
      items: [{ product_id: productId, qty: 1, unit_price: 50 }],
      payments: [{ account_id: cashAccountId, amount: 50, date: TEST_DATE }],
    });

    await rebuildGeneralLedger();
    const tb = await getTrialBalanceFromLedger();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(0.02);
  });

  it('ignores legacy tax columns so trial balance has no GST accounts', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Taxed Legacy Item',
      opening_qty: 10,
      opening_cost: 20,
      sell_price: 118,
    });

    const saleId = await createSale({
      party_name: 'Legacy Buyer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 1, unit_price: 118 }],
      payments: [{ account_id: cashAccountId, amount: 118, date: TEST_DATE }],
    });

    const db = await getDatabase();
    // Simulate a pre-GST-removal invoice that still stores tax splits on the row.
    await db.runAsync(
      `UPDATE sales
       SET taxable_amount = 100, cgst_amount = 9, sgst_amount = 9, igst_amount = 0
       WHERE id = ?`,
      [saleId]
    );

    await rebuildGeneralLedger();
    const tb = await getTrialBalanceFromLedger();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(0.02);
    const gstAccounts = tb.rows.filter((row) => /gst/i.test(row.account));
    expect(gstAccounts).toEqual([]);

    // Balance sheet must not resurrect Input/Output Tax from legacy tax columns.
    const sheet = await getBalanceSheet();
    expect(sheet.assets.inputTaxCredit).toBe(0);
    expect(sheet.liabilities.outputTax).toBe(0);
    expect(sheet.assets.currentAssets.some((l) => l.key === 'input_tax')).toBe(false);
    expect(sheet.liabilities.currentLiabilities.some((l) => l.key === 'output_tax')).toBe(false);
  });

  it('drains ledger refresh scheduled during awaitPendingLedgerRefresh', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Await Drain Item',
      opening_qty: 5,
      opening_cost: 10,
      sell_price: 50,
    });

    await createSale({
      party_name: 'Await Buyer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 1, unit_price: 50 }],
      payments: [{ account_id: cashAccountId, amount: 50, date: TEST_DATE }],
    });

    scheduleGeneralLedgerRefresh({ type: 'full' });
    const pending = awaitPendingLedgerRefresh();
    // Queue another refresh while the first flush may still be running.
    scheduleGeneralLedgerRefresh({ type: 'full' });
    await pending;
    await awaitPendingLedgerRefresh();

    const tb = await getTrialBalanceFromLedger();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(0.02);
  });

  it('payment voucher against invoice keeps TB balanced after scoped refresh', async () => {
    const { createPaymentVoucher } = await import('../paymentVouchers');
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Voucher Widget',
      opening_qty: 10,
      opening_cost: 20,
      sell_price: 100,
    });

    const saleId = await createSale({
      party_name: 'Voucher Customer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 1, unit_price: 100 }],
      payments: [],
    });
    const sale = await getDatabase().then((db) =>
      db.getFirstAsync<{ invoice_no: string }>('SELECT invoice_no FROM sales WHERE id = ?', [saleId])
    );

    await createPaymentVoucher({
      voucher_type: 'receipt',
      voucher_no: 'RV-TEST-1',
      date: TEST_DATE,
      party_name: 'Voucher Customer',
      party_type: 'customer',
      account_id: cashAccountId,
      amount: 100,
      lines: [
        { ledger_name: 'Voucher Customer', is_party: true, amount: -100, is_deemed_positive: true },
        { ledger_name: 'Cash', is_bank_cash: true, amount: 100, is_deemed_positive: false },
      ],
      allocations: [
        { bill_name: sale!.invoice_no, bill_type: 'agst_ref', amount: 100 },
      ],
    });

    await awaitPendingLedgerRefresh();
    const tb = await getTrialBalanceFromLedger();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(0.02);

    const paid = await getDatabase().then((db) =>
      db.getFirstAsync<{ paid_amount: number; status: string }>(
        'SELECT paid_amount, status FROM sales WHERE id = ?',
        [saleId]
      )
    );
    expect(paid?.paid_amount).toBe(100);
    expect(paid?.status).toBe('paid');
  });
});

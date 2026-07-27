import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { createExpense } from '../banking';
import { getDashboardStats } from '../dashboard';
import { getGrowthReport } from '../growth';
import { createProduct } from '../inventory';
import {
  awaitPendingLedgerRefresh,
  rebuildGeneralLedger,
  resetLedgerRefreshSchedulerForTests,
} from '../ledger';
import { upsertParty } from '../parties';
import { createPurchase } from '../purchases';
import {
  getCashFlowReport,
  getPayablesReport,
  getProfitLossReport,
  getReceivablesReport,
  getTrialBalanceReport,
} from '../reports';
import { createSale } from '../sales';
import { toPaise } from '../../utils/money';

const TEST_DATE = '2026-04-10';
const PERIOD_KEY = '2026-04';

async function getCashAccountId(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return row.id;
}

describe('reports integration', () => {
  beforeEach(async () => {
    resetLedgerRefreshSchedulerForTests();
    await initializeFreshDatabase();
  });

  afterEach(() => {
    resetLedgerRefreshSchedulerForTests();
  });

  it('computes P&L, cash flow, trial balance, and AR/AP from seeded books', async () => {
    const cashAccountId = await getCashAccountId();
    await upsertParty('Report Buyer', 'customer');
    await upsertParty('Report Vendor', 'vendor');

    const productId = await createProduct({
      name: 'Report Widget',
      opening_qty: 50,
      opening_cost: toPaise(40),
      sell_price: toPaise(100),
    });

    await createSale({
      party_name: 'Report Buyer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 3, unit_price: toPaise(100) }],
      payments: [{ account_id: cashAccountId, amount: toPaise(300), date: TEST_DATE }],
    });

    await createSale({
      party_name: 'Report Buyer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 1, unit_price: toPaise(100) }],
      payments: [],
    });

    await createPurchase({
      supplier_name: 'Report Vendor',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 5, unit_cost: toPaise(40) }],
      payments: [{ account_id: cashAccountId, amount: toPaise(150), date: TEST_DATE }],
    });

    await createExpense({
      category: 'Rent',
      amount: toPaise(25),
      account_id: cashAccountId,
      date: TEST_DATE,
      description: 'April rent',
    });

    await rebuildGeneralLedger();
    await awaitPendingLedgerRefresh();

    const pl = await getProfitLossReport(PERIOD_KEY);
    expect(pl.revenue).toBe(toPaise(400));
    expect(pl.cogs).toBe(toPaise(160));
    expect(pl.expenses).toBe(toPaise(25));
    expect(pl.grossProfit).toBe(toPaise(240));
    expect(pl.netProfit).toBe(toPaise(215));

    const cashFlow = await getCashFlowReport(PERIOD_KEY);
    expect(cashFlow.operating.customerReceipts).toBe(toPaise(300));
    expect(cashFlow.operating.supplierPayments).toBe(toPaise(150));
    expect(cashFlow.operating.expenses).toBe(toPaise(25));
    expect(cashFlow.operating.net).toBe(toPaise(125));

    const tb = await getTrialBalanceReport();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(1);

    const receivables = await getReceivablesReport();
    expect(receivables).toHaveLength(1);
    expect(receivables[0].due).toBe(toPaise(100));

    const payables = await getPayablesReport();
    expect(payables).toHaveLength(1);
    expect(payables[0].due).toBe(toPaise(50));

    const dashboard = await getDashboardStats(PERIOD_KEY, 'accrual');
    expect(dashboard.sold).toBe(toPaise(400));
    expect(dashboard.netProfit).toBe(toPaise(215));

    const growth = await getGrowthReport(new Date('2026-04-15T12:00:00'));
    const april = growth.months.find((m) => m.monthKey === PERIOD_KEY);
    expect(april?.hasActivity).toBe(true);
    expect(april?.revenue).toBe(toPaise(400));
    expect(april?.netProfit).toBe(toPaise(215));
  });
});

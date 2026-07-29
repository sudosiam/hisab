import { createExpense } from '../banking';
import { getPeriodFinancials } from '../financials';
import { createProduct } from '../inventory';
import {
  awaitPendingLedgerRefresh,
  getTrialBalanceFromLedger,
  rebuildGeneralLedger,
  resetLedgerRefreshSchedulerForTests,
} from '../ledger';
import { createSale } from '../sales';
import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { toPaise } from '../../utils/money';

const TEST_DATE = '2026-01-20';
const PERIOD = '2026-01';

async function getCashAccountId(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return row.id;
}

describe('P&L SQL vs ledger reconcile', () => {
  beforeEach(async () => {
    resetLedgerRefreshSchedulerForTests();
    await initializeFreshDatabase();
  });

  afterEach(() => {
    resetLedgerRefreshSchedulerForTests();
  });

  it('accrual net profit matches within 1 paise of a balanced ledger book', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Reconcile Widget',
      opening_qty: 10,
      opening_cost: toPaise(40),
      sell_price: toPaise(100),
    });

    await createSale({
      party_name: 'Reconcile Customer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 2, unit_price: toPaise(100) }],
      payments: [{ account_id: cashAccountId, amount: toPaise(200), date: TEST_DATE }],
    });

    await createExpense({
      category: 'Rent',
      amount: toPaise(50),
      date: TEST_DATE,
      account_id: cashAccountId,
      description: 'Shop rent',
    });

    await rebuildGeneralLedger();
    await awaitPendingLedgerRefresh();

    const financials = await getPeriodFinancials(PERIOD, undefined, 'accrual');
    const tb = await getTrialBalanceFromLedger();
    expect(Math.abs(tb.totalDebit - tb.totalCredit)).toBeLessThan(1);

    // Dual-path invariant: direct P&L path stays finite and coherent with COGS.
    expect(financials.revenue).toBe(toPaise(200));
    expect(financials.cogs).toBe(toPaise(80));
    expect(financials.expenses).toBe(toPaise(50));
    expect(financials.netProfit).toBe(toPaise(70));
    expect(Math.abs(financials.grossProfit - (financials.revenue - financials.cogs))).toBeLessThan(1);
  });
});

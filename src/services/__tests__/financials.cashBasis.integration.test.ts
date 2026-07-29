import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { toPaise } from '../../utils/money';
import { getPeriodFinancials } from '../financials';
import { createProduct } from '../inventory';
import { createSale } from '../sales';

const TEST_DATE = '2026-01-15';
const PERIOD = '2026-01';

async function getCashAccountId(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return row.id;
}

describe('getPeriodFinancials cash basis', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('allocates COGS proportionally for partial payments (not integer-truncated to 0)', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Partial COGS Widget',
      opening_qty: 10,
      opening_cost: toPaise(100),
      sell_price: toPaise(200),
    });

    // Invoice ₹200 (20000 paise), COGS ₹100 (10000 paise) for 1 unit; pay half ₹100.
    await createSale({
      party_name: 'Partial Payer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 1, unit_price: toPaise(200) }],
      payments: [{ account_id: cashAccountId, amount: toPaise(100), date: TEST_DATE }],
    });

    const cash = await getPeriodFinancials(PERIOD, undefined, 'cash');
    expect(cash.revenue).toBe(toPaise(100));
    // Half of invoice paid → half of COGS (10000 * 0.5 = 5000), not 0 from integer division.
    expect(cash.cogs).toBe(toPaise(50));
    expect(cash.grossProfit).toBe(toPaise(50));
  });
});

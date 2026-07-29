import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { toPaise } from '../../utils/money';
import { createProduct, getProductById } from '../inventory';
import { createPurchase } from '../purchases';
import { createSale } from '../sales';

const TEST_DATE = '2026-01-15';

async function getCashAccountId(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return row.id;
}

describe('fractional inventory quantities', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('preserves 2-decimal qty through purchase and sale', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Loose Rice',
      opening_qty: 0,
      opening_cost: toPaise(40),
      sell_price: toPaise(60),
    });

    await createPurchase({
      supplier_name: 'Grain Vendor',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 2.5, unit_cost: toPaise(40) }],
      payments: [{ account_id: cashAccountId, amount: toPaise(100), date: TEST_DATE }],
    });

    const afterBuy = await getProductById(productId);
    expect(afterBuy?.current_qty).toBe(2.5);

    await createSale({
      party_name: 'Retail Buyer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 1.25, unit_price: toPaise(60) }],
      payments: [{ account_id: cashAccountId, amount: toPaise(75), date: TEST_DATE }],
    });

    const afterSell = await getProductById(productId);
    expect(afterSell?.current_qty).toBe(1.25);
  });
});

import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { createProduct, getProductById } from '../inventory';
import {
  createPurchase,
  getPurchaseById,
  getPurchasePayments,
  removePurchasePayment,
} from '../purchases';
import {
  addSalePayment,
  createSale,
  getSaleById,
  getSalePayments,
  removeSalePayment,
} from '../sales';

const TEST_DATE = '2026-01-15';

async function getCashAccountId(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return row.id;
}

describe('sale and purchase payment integration', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('createSale deducts stock, credits cash, and removeSalePayment reverses the payment', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Test Bulb',
      opening_qty: 10,
      opening_cost: 50,
      sell_price: 100,
    });

    const saleId = await createSale({
      party_name: 'Test Customer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 2, unit_price: 100 }],
      payments: [{ account_id: cashAccountId, amount: 120, date: TEST_DATE }],
    });

    const product = await getProductById(productId);
    expect(product?.current_qty).toBe(8);

    const cash = await getDatabase().then((db) =>
      db.getFirstAsync<{ current_balance: number }>(
        'SELECT current_balance FROM accounts WHERE id = ?',
        [cashAccountId]
      )
    );
    expect(cash?.current_balance).toBe(120);

    const sale = await getSaleById(saleId);
    expect(sale?.paid_amount).toBe(120);
    expect(sale?.status).toBe('partial');

    const [payment] = await getSalePayments(saleId);
    await removeSalePayment(saleId, payment.id);

    const saleAfter = await getSaleById(saleId);
    expect(saleAfter?.paid_amount).toBe(0);
    expect(saleAfter?.status).toBe('unpaid');

    const cashAfter = await getDatabase().then((db) =>
      db.getFirstAsync<{ current_balance: number }>(
        'SELECT current_balance FROM accounts WHERE id = ?',
        [cashAccountId]
      )
    );
    expect(cashAfter?.current_balance).toBe(0);

    const productAfter = await getProductById(productId);
    expect(productAfter?.current_qty).toBe(8);
  });

  it('createPurchase increases stock, debits cash, and removePurchasePayment restores due', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Test Cable',
      opening_qty: 0,
      opening_cost: 0,
      sell_price: 80,
    });

    const purchaseId = await createPurchase({
      supplier_name: 'Test Vendor',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 5, unit_cost: 40 }],
      payments: [{ account_id: cashAccountId, amount: 100, date: TEST_DATE }],
    });

    const product = await getProductById(productId);
    expect(product?.current_qty).toBe(5);

    const cash = await getDatabase().then((db) =>
      db.getFirstAsync<{ current_balance: number }>(
        'SELECT current_balance FROM accounts WHERE id = ?',
        [cashAccountId]
      )
    );
    expect(cash?.current_balance).toBe(-100);

    const purchase = await getPurchaseById(purchaseId);
    expect(purchase?.paid_amount).toBe(100);
    expect(purchase?.status).toBe('partial');

    const [payment] = await getPurchasePayments(purchaseId);
    await removePurchasePayment(purchaseId, payment.id);

    const purchaseAfter = await getPurchaseById(purchaseId);
    expect(purchaseAfter?.paid_amount).toBe(0);
    expect(purchaseAfter?.status).toBe('unpaid');

    const cashAfter = await getDatabase().then((db) =>
      db.getFirstAsync<{ current_balance: number }>(
        'SELECT current_balance FROM accounts WHERE id = ?',
        [cashAccountId]
      )
    );
    expect(cashAfter?.current_balance).toBe(0);
  });

  it('addSalePayment and removeSalePayment keep invoice totals in sync', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Test Panel',
      opening_qty: 4,
      opening_cost: 200,
      sell_price: 300,
    });

    const saleId = await createSale({
      party_name: 'Sync Customer',
      date: TEST_DATE,
      items: [{ product_id: productId, qty: 1, unit_price: 300 }],
      payments: [],
    });

    await addSalePayment(saleId, { account_id: cashAccountId, amount: 150, date: TEST_DATE });
    let sale = await getSaleById(saleId);
    expect(sale?.paid_amount).toBe(150);
    expect(sale?.status).toBe('partial');

    const payments = await getSalePayments(saleId);
    await removeSalePayment(saleId, payments[0].id);

    sale = await getSaleById(saleId);
    expect(sale?.paid_amount).toBe(0);
    expect(sale?.status).toBe('unpaid');
    expect(await getSalePayments(saleId)).toHaveLength(0);
  });
});

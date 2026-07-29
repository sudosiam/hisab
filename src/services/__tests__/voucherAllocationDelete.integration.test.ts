import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { toPaise } from '../../utils/money';
import { createProduct } from '../inventory';
import { createPaymentVoucher } from '../paymentVouchers';
import { createSale, deleteSale, getSalePayments, removeSalePayment } from '../sales';

const TEST_DATE = '2026-01-15';

async function getCashAccountId(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return row.id;
}

describe('payment voucher allocation delete policy', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('blocks deleteSale when a receipt voucher allocates to the invoice', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Voucher Link Item',
      opening_qty: 5,
      opening_cost: toPaise(50),
      sell_price: toPaise(100),
    });

    const saleId = await createSale({
      party_name: 'Voucher Customer',
      date: TEST_DATE,
      invoice_no: 'INV-V1',
      items: [{ product_id: productId, qty: 1, unit_price: toPaise(100) }],
      payments: [],
    });

    await createPaymentVoucher({
      voucher_type: 'receipt',
      voucher_no: 'RCPT-V1',
      date: TEST_DATE,
      party_name: 'Voucher Customer',
      account_id: cashAccountId,
      amount: toPaise(100),
      lines: [
        { ledger_name: 'Voucher Customer', is_party: true, amount: toPaise(100) },
        { ledger_name: 'Cash', is_bank_cash: true, amount: toPaise(100) },
      ],
      allocations: [{ bill_name: 'INV-V1', bill_type: 'agst_ref', amount: toPaise(100) }],
    });

    await expect(deleteSale(saleId)).rejects.toThrow(/linked to Receipt RCPT-V1/i);
  });

  it('clears voucher allocations when removing the linked sale payment', async () => {
    const cashAccountId = await getCashAccountId();
    const productId = await createProduct({
      name: 'Orphan Alloc Item',
      opening_qty: 5,
      opening_cost: toPaise(50),
      sell_price: toPaise(100),
    });

    const saleId = await createSale({
      party_name: 'Orphan Customer',
      date: TEST_DATE,
      invoice_no: 'INV-O1',
      items: [{ product_id: productId, qty: 1, unit_price: toPaise(100) }],
      payments: [],
    });

    await createPaymentVoucher({
      voucher_type: 'receipt',
      voucher_no: 'RCPT-O1',
      date: TEST_DATE,
      party_name: 'Orphan Customer',
      account_id: cashAccountId,
      amount: toPaise(100),
      lines: [
        { ledger_name: 'Orphan Customer', is_party: true, amount: toPaise(100) },
        { ledger_name: 'Cash', is_bank_cash: true, amount: toPaise(100) },
      ],
      allocations: [{ bill_name: 'INV-O1', bill_type: 'agst_ref', amount: toPaise(100) }],
    });

    const [payment] = await getSalePayments(saleId);
    expect(payment).toBeTruthy();

    await removeSalePayment(saleId, payment.id);

    const db = await getDatabase();
    const leftover = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM payment_voucher_allocations WHERE sale_payment_id = ?`,
      [payment.id]
    );
    expect(leftover?.c).toBe(0);

    // Sale itself is no longer blocked by that payment allocation (sale_id rows may remain
    // only if voucher kept sale_id without payment — allocation rows for this payment are gone).
    const bySale = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM payment_voucher_allocations WHERE sale_id = ? AND sale_payment_id = ?`,
      [saleId, payment.id]
    );
    expect(bySale?.c).toBe(0);
  });
});

import { transactionsToLedgerRows } from '../ledgerRows';
import type { Transaction } from '../../types';

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date'>): Transaction {
  return {
    account_id: 1,
    type: 'deposit',
    reference_type: null,
    reference_id: null,
    payment_id: null,
    description: 'Test',
    created_at: '2026-01-01',
    ...partial,
  };
}

describe('transactionsToLedgerRows', () => {
  it('builds running balance from chronological transactions', () => {
    const rows = transactionsToLedgerRows([
      tx({ id: 1, date: '2026-01-01', amount: 100, type: 'opening' }),
      tx({ id: 2, date: '2026-01-02', amount: -30, type: 'expense' }),
      tx({ id: 3, date: '2026-01-03', amount: 50, type: 'sale_payment' }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].balance).toBe(100);
    expect(rows[1].balance).toBe(70);
    expect(rows[2].balance).toBe(120);
  });

  it('maps positive amounts to debit and negative to credit', () => {
    const rows = transactionsToLedgerRows([
      tx({ id: 1, date: '2026-01-01', amount: 25 }),
      tx({ id: 2, date: '2026-01-02', amount: -10 }),
    ]);
    expect(rows[0].debit).toBe(25);
    expect(rows[0].credit).toBe(0);
    expect(rows[1].debit).toBe(0);
    expect(rows[1].credit).toBe(10);
  });
});

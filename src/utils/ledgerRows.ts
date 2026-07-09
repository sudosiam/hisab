import { roundMoney } from './money';
import type { LedgerRow } from '../components/LedgerTable';
import type { Transaction } from '../types';

/** Convert cash account transactions into classic Dr / Cr / Balance ledger lines. */
export function transactionsToLedgerRows(transactions: Transaction[]): LedgerRow[] {
  const sorted = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );
  let balance = 0;
  return sorted.map((tx) => {
    const debit = tx.amount > 0 ? roundMoney(tx.amount) : 0;
    const credit = tx.amount < 0 ? roundMoney(Math.abs(tx.amount)) : 0;
    balance = roundMoney(balance + tx.amount);
    return {
      id: String(tx.id),
      date: tx.date,
      description: tx.description,
      debit,
      credit,
      balance,
    };
  });
}

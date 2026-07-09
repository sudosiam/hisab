import { expectedAccountBalanceFromLedger } from '../database';

describe('expectedAccountBalanceFromLedger', () => {
  it('uses transaction sum when opening balance is stored as a ledger row', () => {
    expect(expectedAccountBalanceFromLedger(1000, 1500, true)).toBe(1500);
  });

  it('adds opening balance when no opening transaction exists (legacy books)', () => {
    expect(expectedAccountBalanceFromLedger(1000, 500, false)).toBe(1500);
  });
});

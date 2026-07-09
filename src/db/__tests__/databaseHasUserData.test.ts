import { hasUserDataFromCounts } from '../database';

describe('hasUserDataFromCounts', () => {
  const empty = {
    sales: 0,
    purchases: 0,
    products: 0,
    parties: 0,
    expenses: 0,
    otherIncome: 0,
    fixedAssets: 0,
    loans: 0,
    transactions: 0,
  };

  it('returns false for a freshly seeded database with no activity', () => {
    expect(hasUserDataFromCounts(empty)).toBe(false);
  });

  it('returns true when only banking ledger rows exist (opening balance setup)', () => {
    expect(hasUserDataFromCounts({ ...empty, transactions: 1 })).toBe(true);
  });

  it('returns true when any business table has rows', () => {
    expect(hasUserDataFromCounts({ ...empty, parties: 1 })).toBe(true);
  });
});

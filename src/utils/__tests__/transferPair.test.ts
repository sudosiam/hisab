import { pickLegacyTransferPair } from '../transferPair';

describe('pickLegacyTransferPair', () => {
  const leg = {
    id: 1,
    account_id: 1,
    amount: -100,
    date: '2026-01-01',
    type: 'transfer',
    reference_type: null,
    reference_id: null,
  };

  it('returns the matching opposite leg', () => {
    const match = pickLegacyTransferPair(leg, [
      leg,
      { ...leg, id: 2, account_id: 2, amount: 100 },
    ]);
    expect(match.id).toBe(2);
  });

  it('throws when no match exists', () => {
    expect(() => pickLegacyTransferPair(leg, [leg])).toThrow(/Could not find/);
  });

  it('throws when multiple matches exist', () => {
    expect(() =>
      pickLegacyTransferPair(leg, [
        leg,
        { ...leg, id: 2, account_id: 2, amount: 100 },
        { ...leg, id: 3, account_id: 3, amount: 100 },
      ])
    ).toThrow(/Several transfers match/);
  });
});

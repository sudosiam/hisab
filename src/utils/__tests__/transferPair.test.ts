import { pickLegacyTransferPair } from '../transferPair';

describe('pickLegacyTransferPair', () => {
  const outLeg = {
    id: 10,
    account_id: 1,
    amount: -5000,
    date: '2026-01-15',
    type: 'transfer',
    reference_type: null,
    reference_id: null,
  };

  it('finds the single opposite leg on another account', () => {
    const pair = pickLegacyTransferPair(outLeg, [
      outLeg,
      {
        id: 11,
        account_id: 2,
        amount: 5000,
        date: '2026-01-15',
        type: 'transfer',
        reference_type: null,
        reference_id: null,
      },
    ]);
    expect(pair.id).toBe(11);
  });

  it('throws when multiple transfers share the same date and amount', () => {
    expect(() =>
      pickLegacyTransferPair(outLeg, [
        outLeg,
        {
          id: 11,
          account_id: 2,
          amount: 5000,
          date: '2026-01-15',
          type: 'transfer',
          reference_type: null,
          reference_id: null,
        },
        {
          id: 13,
          account_id: 2,
          amount: 5000,
          date: '2026-01-15',
          type: 'transfer',
          reference_type: null,
          reference_id: null,
        },
      ])
    ).toThrow(/Several transfers match/);
  });
});

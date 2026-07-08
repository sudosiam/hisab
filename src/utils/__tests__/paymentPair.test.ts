import { pickLegacyPaymentMatch } from '../paymentPair';

describe('pickLegacyPaymentMatch', () => {
  it('returns the sole candidate', () => {
    expect(pickLegacyPaymentMatch([{ id: 7 }])).toEqual({ id: 7 });
  });

  it('throws when no candidates match', () => {
    expect(() => pickLegacyPaymentMatch([])).toThrow(/Could not find/);
  });

  it('throws when multiple candidates are ambiguous', () => {
    expect(() => pickLegacyPaymentMatch([{ id: 1 }, { id: 2 }])).toThrow(/Several payments match/);
  });
});

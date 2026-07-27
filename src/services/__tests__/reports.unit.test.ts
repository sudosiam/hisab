import { sumReportAmounts } from '../reports';

describe('sumReportAmounts', () => {
  it('sums and rounds report row totals in paise', () => {
    expect(sumReportAmounts([])).toBe(0);
    expect(
      sumReportAmounts([{ total_amount: 1010 }, { total_amount: 2011 }])
    ).toBe(3021);
  });
});

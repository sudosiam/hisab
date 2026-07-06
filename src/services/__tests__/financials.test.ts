import { calculateSaleCogs, calculateSaleGrossProfit } from '../financials';

describe('financials', () => {
  it('calculates COGS with per-line rounding', () => {
    const items = [
      { unit_cost: 10.33, qty: 3 },
      { unit_cost: 5.55, qty: 2 },
    ];
    expect(calculateSaleCogs({ subtotal: 100, discount_amount: 0 }, items)).toBe(42.09);
  });

  it('calculates gross profit from total minus COGS', () => {
    const sale = { subtotal: 100, discount_amount: 10, total_amount: 90 };
    const items = [{ unit_cost: 20, qty: 2 }];
    expect(calculateSaleGrossProfit(sale, items)).toBe(50);
  });
});

import { calculateSaleCogs, calculateSaleGrossProfit } from '../financials';
import { toPaise } from '../../utils/money';

describe('financials', () => {
  it('calculates COGS with per-line rounding in paise', () => {
    const items = [
      { unit_cost: toPaise(10.33), qty: 3 },
      { unit_cost: toPaise(5.55), qty: 2 },
    ];
    expect(calculateSaleCogs({ subtotal: toPaise(100), discount_amount: 0 }, items)).toBe(
      toPaise(42.09)
    );
  });

  it('calculates gross profit from total minus COGS', () => {
    const sale = {
      subtotal: toPaise(100),
      discount_amount: toPaise(10),
      total_amount: toPaise(90),
    };
    const items = [{ unit_cost: toPaise(20), qty: 2 }];
    expect(calculateSaleGrossProfit(sale, items)).toBe(toPaise(50));
  });
});

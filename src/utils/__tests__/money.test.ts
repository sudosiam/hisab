import { addMoney, mulMoney, roundMoney, subMoney } from '../money';

describe('money utilities', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.006)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1);
  });

  it('adds without IEEE drift', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(addMoney(100.33, 200.67, 50)).toBe(351);
  });

  it('multiplies with rounding', () => {
    expect(mulMoney(3, 33.33)).toBe(99.99);
    expect(mulMoney(2.5, 4)).toBe(10);
  });

  it('subtracts with rounding', () => {
    expect(subMoney(100, 33.33)).toBe(66.67);
    expect(subMoney(0.3, 0.1)).toBe(0.2);
  });

  it('handles split payments that must sum correctly', () => {
    const parts = [33.33, 33.33, 33.34];
    expect(addMoney(...parts)).toBe(100);
  });
});

import {
  formatAmountInput,
  formatCurrency,
  formatSignedCurrency,
  parsePositiveAmount,
} from '../format';

describe('format utilities', () => {
  it('formats Indian currency grouping', () => {
    expect(formatCurrency(1234567)).toBe('₹12,34,567');
    expect(formatCurrency(-500)).toBe('-₹500');
    expect(formatCurrency(0)).toBe('₹0');
  });

  it('formats input without grouping', () => {
    expect(formatAmountInput(1234567)).toBe('1234567');
  });

  it('formats signed currency', () => {
    expect(formatSignedCurrency(100)).toBe('+₹100');
    expect(formatSignedCurrency(-50)).toBe('-₹50');
    expect(formatSignedCurrency(0)).toBe('₹0');
  });

  it('parses positive amounts', () => {
    expect(parsePositiveAmount('100')).toBe(100);
    expect(parsePositiveAmount('99.99')).toBe(99.99);
    expect(parsePositiveAmount('')).toBeNull();
    expect(parsePositiveAmount('-5')).toBeNull();
    expect(parsePositiveAmount('0')).toBeNull();
  });
});

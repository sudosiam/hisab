import {
  formatAmountInput,
  formatCurrency,
  formatSignedCurrency,
  parseAmountInput,
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

  it('preserves paise and sign when prefilling inputs', () => {
    expect(formatAmountInput(10.75)).toBe('10.75');
    expect(formatAmountInput(99.999)).toBe('100');
    expect(formatAmountInput(-5.5)).toBe('-5.5');
    expect(formatAmountInput(NaN)).toBe('0');
  });

  it('parses comma-grouped decimal input', () => {
    expect(parseAmountInput('5,000')).toBe(5000);
    expect(parseAmountInput('1,23,456.50')).toBe(123456.5);
    expect(parseAmountInput('99.99')).toBe(99.99);
    expect(Number.isNaN(parseAmountInput(''))).toBe(true);
    expect(Number.isNaN(parseAmountInput('abc'))).toBe(true);
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

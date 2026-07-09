import {
  formatAmountInput,
  formatCurrency,
  formatIndianMoney,
  formatQtyInput,
  formatSignedCurrency,
  parseAmountInput,
  parsePositiveAmount,
} from '../format';

describe('format utilities', () => {
  it('formats Indian currency with paise', () => {
    expect(formatCurrency(1234567)).toBe('₹12,34,567.00');
    expect(formatCurrency(10.75)).toBe('₹10.75');
    expect(formatCurrency(10.7)).toBe('₹10.70');
    expect(formatCurrency(-500.5)).toBe('-₹500.50');
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('formats plain indian money without symbol', () => {
    expect(formatIndianMoney(1234.5)).toBe('1,234.50');
  });

  it('formats input with two decimal places', () => {
    expect(formatAmountInput(1234567)).toBe('1234567.00');
    expect(formatAmountInput(10.75)).toBe('10.75');
    expect(formatAmountInput(99.999)).toBe('100.00');
    expect(formatAmountInput(-5.5)).toBe('-5.50');
    expect(formatAmountInput(NaN)).toBe('0.00');
  });

  it('parses comma-grouped decimal input to paise', () => {
    expect(parseAmountInput('5,000')).toBe(5000);
    expect(parseAmountInput('1,23,456.50')).toBe(123456.5);
    expect(parseAmountInput('99.99')).toBe(99.99);
    expect(parseAmountInput('10.999')).toBe(11);
    expect(Number.isNaN(parseAmountInput(''))).toBe(true);
    expect(Number.isNaN(parseAmountInput('abc'))).toBe(true);
  });

  it('formats signed currency', () => {
    expect(formatSignedCurrency(100)).toBe('+₹100.00');
    expect(formatSignedCurrency(-50.25)).toBe('-₹50.25');
    expect(formatSignedCurrency(0)).toBe('₹0.00');
  });

  it('formats qty input without unnecessary decimals', () => {
    expect(formatQtyInput(5)).toBe('5');
    expect(formatQtyInput(1.5)).toBe('1.5');
    expect(formatQtyInput(2.25)).toBe('2.25');
    expect(formatQtyInput(-3)).toBe('-3');
  });

  it('parses positive amounts', () => {
    expect(parsePositiveAmount('100')).toBe(100);
    expect(parsePositiveAmount('99.99')).toBe(99.99);
    expect(parsePositiveAmount('')).toBeNull();
    expect(parsePositiveAmount('-5')).toBeNull();
    expect(parsePositiveAmount('0')).toBeNull();
  });
});

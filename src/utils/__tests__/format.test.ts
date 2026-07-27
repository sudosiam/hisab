import {
  formatAmountInput,
  formatCurrency,
  formatCurrencyWhole,
  formatIndianMoney,
  formatQtyInput,
  formatSignedCurrency,
  parseAmountInput,
  parseMoneyInput,
  parsePositiveAmount,
} from '../format';

describe('format utilities (paise amounts)', () => {
  it('formats Indian currency from paise', () => {
    expect(formatCurrency(123456700)).toBe('₹12,34,567.00');
    expect(formatCurrency(1075)).toBe('₹10.75');
    expect(formatCurrency(1070)).toBe('₹10.70');
    expect(formatCurrency(-50050)).toBe('-₹500.50');
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('formats whole rupees without paise', () => {
    expect(formatCurrencyWhole(123456700)).toBe('₹12,34,567');
    expect(formatCurrencyWhole(1075)).toBe('₹11');
    expect(formatCurrencyWhole(1040)).toBe('₹10');
    expect(formatCurrencyWhole(-50060)).toBe('-₹501');
    expect(formatCurrencyWhole(0)).toBe('₹0');
  });

  it('formats plain indian money without symbol', () => {
    expect(formatIndianMoney(123450)).toBe('1,234.50');
  });

  it('formats input with two decimal places from paise', () => {
    expect(formatAmountInput(123456700)).toBe('1234567.00');
    expect(formatAmountInput(1075)).toBe('10.75');
    expect(formatAmountInput(10000)).toBe('100.00');
    expect(formatAmountInput(-550)).toBe('-5.50');
    expect(formatAmountInput(NaN)).toBe('0.00');
  });

  it('parses qty/rate decimals without converting to paise', () => {
    expect(parseAmountInput('5,000')).toBe(5000);
    expect(parseAmountInput('1,23,456.50')).toBe(123456.5);
    expect(parseAmountInput('99.99')).toBe(99.99);
    expect(parseAmountInput('10.999')).toBe(11);
    expect(Number.isNaN(parseAmountInput(''))).toBe(true);
    expect(Number.isNaN(parseAmountInput('abc'))).toBe(true);
  });

  it('parses money input to paise', () => {
    expect(parseMoneyInput('100')).toBe(10000);
    expect(parseMoneyInput('99.99')).toBe(9999);
    expect(parseMoneyInput('1,23,456.50')).toBe(12345650);
  });

  it('formats signed currency from paise', () => {
    expect(formatSignedCurrency(10000)).toBe('+₹100.00');
    expect(formatSignedCurrency(-5025)).toBe('-₹50.25');
    expect(formatSignedCurrency(0)).toBe('₹0.00');
  });

  it('formats qty input without unnecessary decimals', () => {
    expect(formatQtyInput(5)).toBe('5');
    expect(formatQtyInput(1.5)).toBe('1.5');
    expect(formatQtyInput(2.25)).toBe('2.25');
    expect(formatQtyInput(-3)).toBe('-3');
  });

  it('parses positive money amounts as paise', () => {
    expect(parsePositiveAmount('100')).toBe(10000);
    expect(parsePositiveAmount('99.99')).toBe(9999);
    expect(parsePositiveAmount('')).toBeNull();
    expect(parsePositiveAmount('-5')).toBeNull();
    expect(parsePositiveAmount('0')).toBeNull();
  });
});

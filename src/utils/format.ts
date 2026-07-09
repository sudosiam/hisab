import { roundMoney } from './money';

/** Indian-style grouping for the whole-rupee part: 12,34,567 */
function formatIndianGrouping(whole: number): string {
  const digits = String(Math.trunc(Math.abs(whole)));
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`;
}

function splitPaiseAmount(amount: number): { whole: number; paise: number; negative: boolean } {
  const safe = roundMoney(Number.isFinite(amount) ? amount : 0);
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs + 1e-9);
  let paise = Math.round((abs - whole) * 100);
  if (paise >= 100) {
    return { whole: whole + 1, paise: 0, negative };
  }
  return { whole, paise, negative };
}

/** Indian-grouped amount with two decimal places (paise). */
export function formatIndianMoney(amount: number): string {
  const { whole, paise, negative } = splitPaiseAmount(amount);
  const body = `${formatIndianGrouping(whole)}.${String(paise).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

export function formatCurrency(amount: number): string {
  const body = formatIndianMoney(amount);
  if (body.startsWith('-')) return `-₹${body.slice(1)}`;
  return `₹${body}`;
}

/**
 * Plain decimal string for prefilling input fields — no grouping, always two
 * decimal places so paise is never lost on save.
 */
export function formatAmountInput(amount: number): string {
  const safe = roundMoney(Number.isFinite(amount) ? amount : 0);
  const formatted = Math.abs(safe).toFixed(2);
  return safe < 0 ? `-${formatted}` : formatted;
}

export function formatSignedCurrency(amount: number): string {
  if (amount > 0) return `+${formatCurrency(amount)}`;
  if (amount < 0) return formatCurrency(amount);
  return formatCurrency(0);
}

/** Short axis / chip labels for very large amounts (L = lakh, Cr = crore). */
export function formatCurrencyCompact(amount: number): string {
  const safe = roundMoney(Number.isFinite(amount) ? amount : 0);
  const sign = safe < 0 ? '−' : '';
  const abs = Math.abs(safe);
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  if (abs >= 1e4) return `${sign}₹${(abs / 1e3).toFixed(0)}K`;
  return formatCurrency(safe);
}

export function formatPercent(value: number, decimals = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? '+' : '';
  return `${sign}${safe.toFixed(decimals)}%`;
}

export function formatQty(qty: number, unit = ''): string {
  const safe = Number.isFinite(qty) ? qty : 0;
  const whole = Math.trunc(Math.abs(safe));
  const fraction = Math.round((Math.abs(safe) - whole) * 100);
  let formatted: string;
  if (fraction === 0) {
    formatted = formatIndianGrouping(whole);
  } else {
    const dec = fraction % 10 === 0 ? String(fraction / 10) : String(fraction).padStart(2, '0');
    formatted = `${formatIndianGrouping(whole)}.${dec}`;
  }
  if (safe < 0) formatted = `-${formatted}`;
  return unit ? `${formatted} ${unit}` : formatted;
}

/** Plain qty string for input prefills — no grouping, trims trailing zeros. */
export function formatQtyInput(qty: number): string {
  if (!Number.isFinite(qty)) return '';
  const negative = qty < 0;
  const safe = roundMoney(Math.abs(qty));
  const whole = Math.trunc(safe);
  const fraction = Math.round((safe - whole) * 100);
  if (fraction === 0) return negative ? `-${whole}` : String(whole);
  const dec = fraction % 10 === 0 ? String(fraction / 10) : String(fraction).padStart(2, '0');
  const body = `${whole}.${dec}`;
  return negative ? `-${body}` : body;
}

/**
 * Normalize a user-typed amount by stripping grouping separators (commas) and
 * surrounding whitespace so "1,23,456.50" parses correctly. The decimal point
 * is always '.', so commas are safe to remove.
 */
export function normalizeAmountInput(text: string): string {
  return text.replace(/,/g, '').trim();
}

/**
 * Parse a user-typed decimal (money or quantity), tolerating comma grouping
 * ("1,23,456.50" → 123456.5). Returns NaN for empty/invalid input.
 */
export function parseAmountInput(text: string): number {
  const normalized = normalizeAmountInput(text);
  if (!normalized) return NaN;
  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  return roundMoney(parsed);
}

/**
 * Parse a user-typed money string. Returns null for empty, NaN, zero, or negative.
 */
export function parsePositiveAmount(text: string): number | null {
  const parsed = parseAmountInput(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function getPaymentStatusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'partial':
      return 'Part paid';
    case 'unpaid':
      return 'Unpaid';
    default:
      return status;
  }
}

export function getPaymentStatusColor(status: string): string {
  switch (status) {
    case 'paid':
      return '#059669';
    case 'partial':
      return '#D97706';
    case 'unpaid':
      return '#DC2626';
    default:
      return '#6B7280';
  }
}

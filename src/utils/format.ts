import { fromPaise, roundMoney, toPaise } from './money';

/** Indian-style grouping for the whole-rupee part: 12,34,567 */
function formatIndianGrouping(whole: number): string {
  const digits = String(Math.trunc(Math.abs(whole)));
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`;
}

/** Split integer paise into whole rupees + paise remainder. */
function splitPaiseAmount(paiseAmount: number): { whole: number; paise: number; negative: boolean } {
  const safe = roundMoney(Number.isFinite(paiseAmount) ? paiseAmount : 0);
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100);
  const paise = abs % 100;
  return { whole, paise, negative };
}

/** Indian-grouped amount with two decimal places. Input is integer paise. */
export function formatIndianMoney(paiseAmount: number): string {
  const { whole, paise, negative } = splitPaiseAmount(paiseAmount);
  const body = `${formatIndianGrouping(whole)}.${String(paise).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/** Format integer paise as ₹X,XX,XXX.XX */
export function formatCurrency(paiseAmount: number): string {
  const body = formatIndianMoney(paiseAmount);
  if (body.startsWith('-')) return `-₹${body.slice(1)}`;
  return `₹${body}`;
}

/** Indian-grouped rupees only — nearest rupee. Input is integer paise. */
export function formatCurrencyWhole(paiseAmount: number): string {
  const safe = roundMoney(Number.isFinite(paiseAmount) ? paiseAmount : 0);
  const roundedRupees = Math.round(safe / 100);
  const negative = roundedRupees < 0;
  const body = formatIndianGrouping(Math.abs(roundedRupees));
  return negative ? `-₹${body}` : `₹${body}`;
}

/**
 * Plain decimal string for prefilling money inputs (rupees, two decimals).
 * Input is integer paise from the DB/services.
 */
export function formatAmountInput(paiseAmount: number): string {
  const safe = roundMoney(Number.isFinite(paiseAmount) ? paiseAmount : 0);
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100);
  const paise = abs % 100;
  const body = `${whole}.${String(paise).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

export function formatSignedCurrency(paiseAmount: number): string {
  if (paiseAmount > 0) return `+${formatCurrency(paiseAmount)}`;
  if (paiseAmount < 0) return formatCurrency(paiseAmount);
  return formatCurrency(0);
}

/** Short axis / chip labels. Input is integer paise. */
export function formatCurrencyCompact(paiseAmount: number): string {
  const safe = roundMoney(Number.isFinite(paiseAmount) ? paiseAmount : 0);
  const sign = safe < 0 ? '−' : '';
  const absRupees = Math.abs(safe) / 100;
  if (absRupees >= 1e7) return `${sign}₹${(absRupees / 1e7).toFixed(absRupees >= 1e8 ? 0 : 1)}Cr`;
  if (absRupees >= 1e5) return `${sign}₹${(absRupees / 1e5).toFixed(absRupees >= 1e6 ? 0 : 1)}L`;
  if (absRupees >= 1e4) return `${sign}₹${(absRupees / 1e3).toFixed(0)}K`;
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
  const safe = Math.round(Math.abs(qty) * 100) / 100;
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
 * Parse a user-typed decimal (quantity or rate), tolerating comma grouping.
 * Returns NaN for empty/invalid input. Does NOT convert to paise.
 */
export function parseAmountInput(text: string): number {
  const normalized = normalizeAmountInput(text);
  if (!normalized) return NaN;
  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round(parsed * 100) / 100;
}

/**
 * Parse a user-typed money string (rupees) into integer paise.
 * Returns NaN for empty/invalid input.
 */
export function parseMoneyInput(text: string): number {
  const rupees = parseAmountInput(text);
  if (!Number.isFinite(rupees)) return NaN;
  return toPaise(rupees);
}

/**
 * Parse a user-typed money string. Returns null for empty, NaN, zero, or negative.
 * Result is integer paise.
 */
export function parsePositiveAmount(text: string): number | null {
  const parsed = parseMoneyInput(text);
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

/** @internal re-export for call sites that format then need rupees */
export { fromPaise, toPaise };

/** Indian-style grouping: 12,34,567 */
function formatIndianGrouping(whole: number): string {
  const digits = String(Math.trunc(Math.abs(whole)));
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`;
}

function formatIndianAmount(amount: number, useGrouping: boolean): string {
  const whole = Math.round(Math.abs(Number.isFinite(amount) ? amount : 0));
  return useGrouping ? formatIndianGrouping(whole) : String(whole);
}

export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = formatIndianAmount(safe, true);
  return safe < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

/**
 * Plain decimal string for prefilling input fields — no grouping, paise and
 * sign preserved. Rounding paise away here would silently corrupt stored
 * amounts when the user saves a form without editing the field.
 */
export function formatAmountInput(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
  return String(safe);
}

export function formatSignedCurrency(amount: number): string {
  if (amount > 0) return `+${formatCurrency(amount)}`;
  if (amount < 0) return formatCurrency(amount);
  return formatCurrency(0);
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
 * ("1,23,456.50" → 123456.5). Returns NaN for empty/invalid input. Use this
 * instead of raw parseFloat, which stops at the first comma ("5,000" → 5).
 */
export function parseAmountInput(text: string): number {
  return parseFloat(normalizeAmountInput(text));
}

/**
 * Parse a user-typed money/quantity string. Returns null for empty, NaN,
 * zero, or negative input so callers can show a single friendly error.
 */
export function parsePositiveAmount(text: string): number | null {
  const parsed = parseFloat(normalizeAmountInput(text));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
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

/**
 * Money amounts in Hisab are integer paise (1 rupee = 100 paise).
 * Convert at UI / Tally / PDF boundaries with toPaise / fromPaise.
 */

/** Convert a rupee decimal (user/Tally input) to integer paise. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/** Convert integer paise to a rupee number for display/export only. */
export function fromPaise(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

/**
 * Snap to whole paise. Accepts values that may carry float dust from qty × rate.
 * @deprecated Name kept for call-site compatibility — amounts are already paise.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function addMoney(...values: number[]): number {
  return roundMoney(values.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0));
}

/** Multiply amounts; use for qty × unit-paise (rounds to nearest paise). */
export function mulMoney(a: number, b: number): number {
  return roundMoney(a * b);
}

export function subMoney(a: number, b: number): number {
  return roundMoney(a - b);
}

/** True when the absolute amount is less than one paise. */
export function isZeroMoney(amount: number): boolean {
  return Math.abs(roundMoney(amount)) < 1;
}

/** Paid-in-full tolerance: within 1 paise. */
export const PAID_TOLERANCE_PAISE = 1;

/** Exact rupee decimal string from integer paise (no float). */
export function paiseToFixedRupees(paise: number): string {
  const n = Math.round(Number.isFinite(paise) ? paise : 0);
  const negative = n < 0;
  const abs = Math.abs(n);
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/** Round to 2 decimal places (paise) to avoid IEEE 754 drift in currency math. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addMoney(...values: number[]): number {
  return roundMoney(values.reduce((sum, v) => sum + v, 0));
}

export function mulMoney(a: number, b: number): number {
  return roundMoney(a * b);
}

export function subMoney(a: number, b: number): number {
  return roundMoney(a - b);
}

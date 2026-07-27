import { addMoney, fromPaise, mulMoney, roundMoney, subMoney, toPaise } from '../money';

describe('money utilities (integer paise)', () => {
  it('converts rupees ↔ paise', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1.006)).toBe(101);
    expect(toPaise(1.004)).toBe(100);
    expect(fromPaise(101)).toBe(1.01);
    expect(fromPaise(100)).toBe(1);
  });

  it('rounds to whole paise', () => {
    expect(roundMoney(10.4)).toBe(10);
    expect(roundMoney(10.5)).toBe(11);
  });

  it('adds without drift', () => {
    expect(addMoney(10, 20)).toBe(30);
    expect(addMoney(3333, 3333, 3334)).toBe(10000);
  });

  it('multiplies qty × unit paise', () => {
    expect(mulMoney(3, 3333)).toBe(9999);
    expect(mulMoney(2.5, 400)).toBe(1000);
  });

  it('subtracts in paise', () => {
    expect(subMoney(10000, 3333)).toBe(6667);
  });

  it('handles split payments that must sum correctly', () => {
    const parts = [3333, 3333, 3334];
    expect(addMoney(...parts)).toBe(10000);
  });
});

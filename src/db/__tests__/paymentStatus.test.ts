import { getPaymentStatus } from '../database';

describe('getPaymentStatus', () => {
  it('marks fully paid within one-paise tolerance', () => {
    expect(getPaymentStatus(100000, 100000)).toBe('paid');
    expect(getPaymentStatus(100000, 99999)).toBe('paid');
    expect(getPaymentStatus(10001, 10000)).toBe('paid');
  });

  it('marks partial when some payment received', () => {
    expect(getPaymentStatus(100000, 50000)).toBe('partial');
    expect(getPaymentStatus(100000, 1)).toBe('partial');
  });

  it('marks unpaid when nothing paid', () => {
    expect(getPaymentStatus(100000, 0)).toBe('unpaid');
  });

  it('treats zero-total invoice as unpaid unless payment recorded', () => {
    expect(getPaymentStatus(0, 0)).toBe('unpaid');
    expect(getPaymentStatus(0, 1000)).toBe('paid');
  });
});

import { getPaymentStatus } from '../database';

describe('getPaymentStatus', () => {
  it('marks fully paid within paise tolerance', () => {
    expect(getPaymentStatus(1000, 1000)).toBe('paid');
    expect(getPaymentStatus(1000, 999.99)).toBe('paid');
    expect(getPaymentStatus(100.01, 100)).toBe('paid');
  });

  it('marks partial when some payment received', () => {
    expect(getPaymentStatus(1000, 500)).toBe('partial');
    expect(getPaymentStatus(1000, 0.01)).toBe('partial');
  });

  it('marks unpaid when nothing paid', () => {
    expect(getPaymentStatus(1000, 0)).toBe('unpaid');
  });

  it('treats zero-total invoice as unpaid unless payment recorded', () => {
    expect(getPaymentStatus(0, 0)).toBe('unpaid');
    expect(getPaymentStatus(0, 10)).toBe('paid');
  });
});

import { normalizeWhatsAppPhone } from '../whatsappPhone';

describe('normalizeWhatsAppPhone', () => {
  it('prefixes Indian 10-digit numbers with 91', () => {
    expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210');
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('919876543210');
  });

  it('keeps numbers that already include country code', () => {
    expect(normalizeWhatsAppPhone('919876543210')).toBe('919876543210');
  });

  it('rejects short or empty values', () => {
    expect(normalizeWhatsAppPhone('12345')).toBeNull();
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone(null)).toBeNull();
  });
});

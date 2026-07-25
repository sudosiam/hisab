import {
  formatInvoiceSequence,
  parseInvoiceSequence,
  parseInvoiceTemplate,
} from '../../services/invoiceNumbers';

function resolveNextSequence(
  template: { nextSequence: number; digitWidth: number },
  maxDb: number
): { sequence: number; digitWidth: number } {
  const sequence = Math.max(template.nextSequence, maxDb + 1);
  const digitWidth = Math.max(template.digitWidth, String(sequence).length);
  return { sequence, digitWidth };
}

describe('invoiceNumbers', () => {
  it('parses stem + padded sequence templates', () => {
    expect(parseInvoiceTemplate('BPH2627-0003')).toEqual({
      stem: 'BPH2627',
      nextSequence: 3,
      digitWidth: 4,
    });
    expect(parseInvoiceTemplate('S')).toEqual({
      stem: 'S',
      nextSequence: 1,
      digitWidth: 4,
    });
  });

  it('extracts sequence only for matching stem', () => {
    expect(parseInvoiceSequence('BPH2627-0010', 'BPH2627')).toBe(10);
    expect(parseInvoiceSequence('OTHER-0010', 'BPH2627')).toBeNull();
    expect(parseInvoiceSequence('BPH2627-00A1', 'BPH2627')).toBeNull();
  });

  it('advances past both settings counter and db max', () => {
    expect(resolveNextSequence({ nextSequence: 5, digitWidth: 4 }, 10)).toEqual({
      sequence: 11,
      digitWidth: 4,
    });
    expect(resolveNextSequence({ nextSequence: 12, digitWidth: 4 }, 10)).toEqual({
      sequence: 12,
      digitWidth: 4,
    });
    expect(formatInvoiceSequence('S', 12, 4)).toBe('S-0012');
  });
});

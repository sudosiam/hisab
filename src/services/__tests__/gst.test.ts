import {
  assertGstPlaceOfSupply,
  computeGstDocument,
  enforceInvoiceTypeForTax,
  isInterStateSupply,
  isValidGstin,
  isValidStateCode,
} from '../gst';

describe('GST engine', () => {
  it('splits CGST/SGST for intra-state exclusive prices', () => {
    const doc = computeGstDocument({
      lines: [{ qty: 1, unit_price: 100, gst_rate: 18 }],
      business_state: '27',
      party_state: '27',
      gst_enabled: true,
      tax_inclusive: false,
    });
    expect(doc.is_inter_state).toBe(false);
    expect(doc.taxable_amount).toBe(100);
    expect(doc.cgst_amount).toBe(9);
    expect(doc.sgst_amount).toBe(9);
    expect(doc.igst_amount).toBe(0);
    expect(doc.total_amount).toBe(118);
    expect(doc.suggested_invoice_type).toBe('invoice');
  });

  it('uses IGST for inter-state', () => {
    const doc = computeGstDocument({
      lines: [{ qty: 2, unit_price: 50, gst_rate: 12 }],
      business_state: '27',
      party_state: '29',
      gst_enabled: true,
    });
    expect(doc.is_inter_state).toBe(true);
    expect(doc.igst_amount).toBe(12);
    expect(doc.cgst_amount).toBe(0);
    expect(doc.total_amount).toBe(112);
  });

  it('reverse-calculates tax-inclusive prices', () => {
    const doc = computeGstDocument({
      lines: [{ qty: 1, unit_price: 118, gst_rate: 18 }],
      business_state: '27',
      party_state: '27',
      tax_inclusive: true,
      gst_enabled: true,
    });
    expect(doc.taxable_amount).toBe(100);
    expect(doc.tax_amount).toBe(18);
    expect(doc.total_amount).toBe(118);
  });

  it('allocates discount before tax (exclusive)', () => {
    const doc = computeGstDocument({
      lines: [
        { qty: 1, unit_price: 100, gst_rate: 18 },
        { qty: 1, unit_price: 100, gst_rate: 18 },
      ],
      discount_amount: 20,
      business_state: '27',
      party_state: '27',
    });
    expect(doc.taxable_amount).toBe(180);
    expect(doc.tax_amount).toBe(32.4);
    expect(doc.total_amount).toBe(212.4);
  });

  it('enforces Tax Invoice when tax > 0', () => {
    expect(enforceInvoiceTypeForTax('bos', 10)).toBe('invoice');
    expect(enforceInvoiceTypeForTax('bos', 0)).toBe('bos');
  });

  it('requires states when GST is charged', () => {
    expect(() =>
      assertGstPlaceOfSupply({
        gst_enabled: true,
        tax_amount: 18,
        business_state: '27',
        party_state: null,
      })
    ).toThrow(/state/i);
  });

  it('validates GSTIN format and checksum', () => {
    expect(isValidGstin('')).toBe(true);
    expect(isValidGstin('27AAAAA0000A1Z5')).toBe(false); // wrong checksum
    expect(isValidGstin('27AAAAA0000A1Z2')).toBe(true);
    expect(isValidStateCode('27')).toBe(true);
    expect(isValidStateCode('99')).toBe(false);
    expect(isInterStateSupply('27', '29')).toBe(true);
    expect(isInterStateSupply('27', '')).toBe(false);
  });
});

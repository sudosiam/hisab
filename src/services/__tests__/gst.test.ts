import {
  assertGstPlaceOfSupply,
  computeGstDocument,
  enforceInvoiceTypeForTax,
  isInterStateSupply,
  isPlausibleHsnSac,
  isValidGstin,
  isValidStateCode,
  normalizePartyStateForSave,
  normalizeStateToCode,
  resolveStateFromPartyFields,
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

  it('normalizes Tally state names to GST codes', () => {
    expect(normalizeStateToCode('West Bengal')).toBe('19');
    expect(normalizeStateToCode('19')).toBe('19');
    expect(normalizeStateToCode('Orissa')).toBe('21');
    expect(normalizeStateToCode('Pondicherry')).toBe('34');
    expect(normalizeStateToCode('&#4; Any')).toBeNull();
    expect(normalizeStateToCode('Not Applicable')).toBeNull();
    expect(normalizeStateToCode('a')).toBeNull();
    expect(normalizeStateToCode('')).toBeNull();
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

  it('resolves party state from name or GSTIN prefix', () => {
    expect(resolveStateFromPartyFields('Maharashtra', null)).toBe('27');
    expect(resolveStateFromPartyFields(null, '29AAAAA0000A1Z5')).toBe('29');
    expect(resolveStateFromPartyFields('', '')).toBeNull();
  });

  it('rejects GSTIN/state mismatch on save normalize', () => {
    expect(normalizePartyStateForSave('27', '27AAAAA0000A1Z2')).toBe('27');
    expect(() => normalizePartyStateForSave('27', '29AAAAA0000A1Z5')).toThrow(/match/i);
  });

  it('soft-validates HSN lengths', () => {
    expect(isPlausibleHsnSac('')).toBe(true);
    expect(isPlausibleHsnSac('1234')).toBe(true);
    expect(isPlausibleHsnSac('123456')).toBe(true);
    expect(isPlausibleHsnSac('12345678')).toBe(true);
    expect(isPlausibleHsnSac('12345')).toBe(false);
  });

  it('leaves service charges untaxed when rate is null (legacy)', () => {
    const doc = computeGstDocument({
      lines: [{ qty: 1, unit_price: 100, gst_rate: 18 }],
      service_charges: 20,
      business_state: '27',
      party_state: '27',
      gst_enabled: true,
    });
    expect(doc.service_charges_gst_rate).toBeNull();
    expect(doc.taxable_amount).toBe(100);
    expect(doc.tax_amount).toBe(18);
    expect(doc.total_amount).toBe(138);
  });

  it('taxes service charges when rate is provided (exclusive)', () => {
    const doc = computeGstDocument({
      lines: [{ qty: 1, unit_price: 100, gst_rate: 18 }],
      service_charges: 100,
      service_charges_gst_rate: 18,
      business_state: '27',
      party_state: '27',
      gst_enabled: true,
      tax_inclusive: false,
    });
    expect(doc.service_charges_gst_rate).toBe(18);
    expect(doc.service_charges_taxable).toBe(100);
    expect(doc.taxable_amount).toBe(200);
    expect(doc.cgst_amount).toBe(18);
    expect(doc.sgst_amount).toBe(18);
    expect(doc.total_amount).toBe(236);
  });

  it('taxes service charges with tax_service_charges default 18%', () => {
    const doc = computeGstDocument({
      lines: [{ qty: 1, unit_price: 100, gst_rate: 0 }],
      service_charges: 100,
      tax_service_charges: true,
      business_state: '27',
      party_state: '29',
      gst_enabled: true,
    });
    expect(doc.service_charges_gst_rate).toBe(18);
    expect(doc.igst_amount).toBe(18);
    expect(doc.total_amount).toBe(218);
  });
});

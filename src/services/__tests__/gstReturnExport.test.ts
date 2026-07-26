import { buildGstr1Helper, buildGstr3bHelper } from '../gstReturnExport';

jest.mock('../gstReports', () => ({
  getGstSummary: jest.fn(async () => ({
    outwardTaxable: 1000,
    outwardCgst: 90,
    outwardSgst: 90,
    outwardIgst: 0,
    outwardTax: 180,
    inwardTaxable: 500,
    inwardCgst: 45,
    inwardSgst: 45,
    inwardIgst: 0,
    inwardTax: 90,
    netPayable: 90,
  })),
  getGstOutwardSupplies: jest.fn(async () => [
    {
      id: 1,
      date: '2026-04-01',
      invoice_no: 'INV-1',
      invoice_type: 'Tax Invoice',
      party_name: 'Acme',
      party_gstin: '27AAAAA0000A1Z2',
      supply_type: 'B2B',
      taxable_amount: 1000,
      cgst_amount: 90,
      sgst_amount: 90,
      igst_amount: 0,
      total_amount: 1180,
    },
  ]),
  getGstHsnSummary: jest.fn(async () => [
    {
      hsn_sac: '9983',
      gst_rate: 18,
      qty: 1,
      taxable_amount: 1000,
      cgst_amount: 90,
      sgst_amount: 90,
      igst_amount: 0,
      tax_amount: 180,
    },
  ]),
  getGstInwardSupplies: jest.fn(async () => []),
}));

jest.mock('../adjustmentNotes', () => ({
  getAdjustmentNotesForPeriod: jest.fn(async () => []),
}));

jest.mock('../appSettings', () => ({
  getBusinessGstin: jest.fn(async () => '27AAAAA0000A1Z2'),
  getBusinessProfile: jest.fn(async () => ({ business_gstin: '27AAAAA0000A1Z2' })),
}));

jest.mock('../../db/database', () => ({
  getDatabase: jest.fn(async () => ({
    getFirstAsync: jest.fn(async () => ({
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    })),
    getAllAsync: jest.fn(async () => []),
  })),
}));

jest.mock('../../utils/period', () => ({
  resolvePeriodRange: jest.fn(async () => ({ start: '2026-04-01', end: '2026-04-30' })),
}));

describe('GSTR helper export', () => {
  it('builds GSTR-1 helper with disclaimer and b2b', async () => {
    const { json, csvParts } = await buildGstr1Helper('2026-04');
    const payload = json as {
      meta: { form: string; disclaimer: string };
      b2b: unknown[];
    };
    expect(payload.meta.form).toMatch(/GSTR-1/i);
    expect(payload.meta.disclaimer).toMatch(/verify/i);
    expect(payload.b2b.length).toBe(1);
    expect(csvParts.some((p) => p.name.includes('b2b'))).toBe(true);
  });

  it('builds GSTR-3B helper with net payable', async () => {
    const { json, csv } = await buildGstr3bHelper('2026-04');
    const payload = json as { meta: { form: string }; net_payable: number };
    expect(payload.meta.form).toMatch(/GSTR-3B/i);
    expect(payload.net_payable).toBe(90);
    expect(csv).toMatch(/net/i);
  });
});

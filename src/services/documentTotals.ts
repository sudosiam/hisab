import { addMoney, mulMoney, roundMoney, subMoney } from '../utils/money';

/** Line input for untaxed sale/purchase/note totals (GST removed; columns may still store zeros). */
export interface DocumentLineInput {
  qty: number;
  unit_price: number;
  hsn_sac?: string | null;
}

export interface DocumentLineResult {
  line_total: number;
  taxable_amount: number;
  gst_rate: number;
  hsn_sac: string | null;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
}

export interface DocumentTotalsResult {
  is_inter_state: boolean;
  place_of_supply: string | null;
  lines: DocumentLineResult[];
  subtotal: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
  discount_amount: number;
  service_charges: number;
  service_charges_gst_rate: number | null;
  service_charges_taxable: number;
  service_charges_cgst: number;
  service_charges_sgst: number;
  service_charges_igst: number;
  total_amount: number;
}

/**
 * Allocate invoice-level discount across lines by share; no tax.
 * Replaces former computeGstDocument(..., gst_enabled: false).
 */
export function computeUntaxedDocument(params: {
  lines: DocumentLineInput[];
  discount_amount?: number;
  service_charges?: number;
}): DocumentTotalsResult {
  const rawLines = params.lines.map((line) => {
    const lineTotal = mulMoney(line.qty, line.unit_price);
    return {
      line_total: lineTotal,
      hsn_sac: line.hsn_sac?.trim() || null,
    };
  });

  const subtotal = rawLines.reduce((sum, l) => addMoney(sum, l.line_total), 0);
  const discount = roundMoney(Math.max(0, params.discount_amount ?? 0));
  const serviceCharges = roundMoney(Math.max(0, params.service_charges ?? 0));
  if (discount > subtotal + 1) {
    throw new Error('Discount cannot exceed subtotal');
  }

  const netBase = roundMoney(Math.max(0, subMoney(subtotal, discount)));
  let allocatedNet = 0;
  const lines: DocumentLineResult[] = rawLines.map((raw, index) => {
    let lineNet: number;
    if (subtotal <= 0) {
      lineNet = 0;
    } else if (index === rawLines.length - 1) {
      lineNet = subMoney(netBase, allocatedNet);
    } else {
      lineNet = roundMoney((raw.line_total / subtotal) * netBase);
      allocatedNet = addMoney(allocatedNet, lineNet);
    }

    return {
      line_total: raw.line_total,
      taxable_amount: lineNet,
      gst_rate: 0,
      hsn_sac: raw.hsn_sac,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      tax_amount: 0,
    };
  });

  const lineTaxable = lines.reduce((sum, l) => addMoney(sum, l.taxable_amount), 0);
  const total_amount = roundMoney(Math.max(0, addMoney(lineTaxable, serviceCharges)));

  return {
    is_inter_state: false,
    place_of_supply: null,
    lines,
    subtotal,
    taxable_amount: lineTaxable,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
    tax_amount: 0,
    discount_amount: discount,
    service_charges: serviceCharges,
    service_charges_gst_rate: null,
    service_charges_taxable: 0,
    service_charges_cgst: 0,
    service_charges_sgst: 0,
    service_charges_igst: 0,
    total_amount,
  };
}

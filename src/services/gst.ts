import { addMoney, mulMoney, roundMoney, subMoney } from '../utils/money';

/** Common GST rates used in India (Regular scheme). */
export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu (legacy)' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh (new)' },
  { code: '38', name: 'Ladakh' },
];

export function stateName(code: string | null | undefined): string {
  if (!code) return '';
  const found = INDIAN_STATES.find((s) => s.code === code);
  return found ? found.name : code;
}

/** First 2 digits of GSTIN are the state code. */
export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const cleaned = (gstin ?? '').trim().toUpperCase();
  if (cleaned.length < 2) return null;
  const code = cleaned.slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

export function isValidGstin(gstin: string): boolean {
  const cleaned = gstin.trim().toUpperCase();
  if (!cleaned) return true;
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(cleaned)) {
    return false;
  }
  // GSTIN checksum (mod 36) over first 14 characters.
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let factor = 1;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const codePoint = chars.indexOf(cleaned[i]);
    if (codePoint < 0) return false;
    let product = codePoint * factor;
    factor = factor === 1 ? 2 : 1;
    product = Math.floor(product / chars.length) + (product % chars.length);
    sum += product;
  }
  const checkCodePoint = (chars.length - (sum % chars.length)) % chars.length;
  return cleaned[14] === chars[checkCodePoint];
}

export function isValidStateCode(code: string | null | undefined): boolean {
  const cleaned = (code ?? '').trim();
  if (!cleaned) return false;
  return INDIAN_STATES.some((s) => s.code === cleaned);
}

export function normalizeGstRate(rate: number | null | undefined): number {
  if (!Number.isFinite(rate) || rate == null || rate < 0) return 0;
  const rounded = Math.round(rate * 100) / 100;
  return rounded;
}

export function assertGstPlaceOfSupply(params: {
  gst_enabled: boolean;
  tax_amount: number;
  business_state?: string | null;
  party_state?: string | null;
}): void {
  if (!params.gst_enabled || params.tax_amount <= 0.009) return;
  const biz = (params.business_state ?? '').trim();
  const party = (params.party_state ?? '').trim();
  if (!biz) {
    throw new Error('Set your business state in Settings before charging GST');
  }
  if (!party) {
    throw new Error(
      'Set customer/vendor state (or GSTIN) before charging GST — needed for CGST/SGST vs IGST'
    );
  }
}

export function enforceInvoiceTypeForTax(
  invoiceType: 'invoice' | 'bos',
  taxAmount: number
): 'invoice' | 'bos' {
  if (taxAmount > 0.009) return 'invoice';
  return invoiceType;
}

export interface GstLineInput {
  qty: number;
  unit_price: number;
  gst_rate?: number | null;
  hsn_sac?: string | null;
}

export interface GstLineResult {
  line_total: number;
  taxable_amount: number;
  gst_rate: number;
  hsn_sac: string | null;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
}

export interface GstDocumentResult {
  is_inter_state: boolean;
  place_of_supply: string | null;
  lines: GstLineResult[];
  subtotal: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
  discount_amount: number;
  service_charges: number;
  total_amount: number;
  suggested_invoice_type: 'invoice' | 'bos';
}

export function isInterStateSupply(
  businessState: string | null | undefined,
  partyState: string | null | undefined
): boolean {
  const biz = (businessState ?? '').trim();
  const party = (partyState ?? '').trim();
  // Missing state must not silently default to intra-state when GST is charged —
  // callers should assertGstPlaceOfSupply first.
  if (!biz || !party) return false;
  return biz !== party;
}

/**
 * Allocate invoice-level discount across lines by share, then compute tax.
 * When tax_inclusive is true, unit prices include GST and taxable is reverse-calculated.
 */
export function computeGstDocument(params: {
  lines: GstLineInput[];
  discount_amount?: number;
  service_charges?: number;
  business_state?: string | null;
  party_state?: string | null;
  place_of_supply?: string | null;
  gst_enabled?: boolean;
  tax_inclusive?: boolean;
}): GstDocumentResult {
  const gstEnabled = params.gst_enabled !== false;
  const taxInclusive = gstEnabled && !!params.tax_inclusive;
  const inter = gstEnabled
    ? isInterStateSupply(params.business_state, params.party_state)
    : false;
  const placeOfSupply =
    (params.place_of_supply ?? params.party_state ?? params.business_state ?? null)?.trim() ||
    null;

  const rawLines = params.lines.map((line) => {
    const lineTotal = mulMoney(line.qty, line.unit_price);
    return {
      line_total: lineTotal,
      gst_rate: gstEnabled ? normalizeGstRate(line.gst_rate) : 0,
      hsn_sac: line.hsn_sac?.trim() || null,
    };
  });

  const subtotal = rawLines.reduce((sum, l) => addMoney(sum, l.line_total), 0);
  const discount = roundMoney(Math.max(0, params.discount_amount ?? 0));
  const serviceCharges = roundMoney(Math.max(0, params.service_charges ?? 0));
  if (discount > subtotal + 0.01) {
    throw new Error('Discount cannot exceed subtotal');
  }

  const netBase = roundMoney(Math.max(0, subMoney(subtotal, discount)));
  let allocatedNet = 0;
  const lines: GstLineResult[] = rawLines.map((raw, index) => {
    let lineNet: number;
    if (subtotal <= 0) {
      lineNet = 0;
    } else if (index === rawLines.length - 1) {
      lineNet = subMoney(netBase, allocatedNet);
    } else {
      lineNet = roundMoney((raw.line_total / subtotal) * netBase);
      allocatedNet = addMoney(allocatedNet, lineNet);
    }

    const rate = raw.gst_rate;
    let taxable: number;
    let taxTotal: number;
    if (!gstEnabled || rate <= 0) {
      taxable = lineNet;
      taxTotal = 0;
    } else if (taxInclusive) {
      taxable = roundMoney(lineNet / (1 + rate / 100));
      taxTotal = subMoney(lineNet, taxable);
    } else {
      taxable = lineNet;
      taxTotal = mulMoney(taxable, rate / 100);
    }

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (taxTotal > 0) {
      if (inter) {
        igst = taxTotal;
      } else {
        cgst = roundMoney(taxTotal / 2);
        sgst = subMoney(taxTotal, cgst);
      }
    }

    return {
      line_total: raw.line_total,
      taxable_amount: taxable,
      gst_rate: rate,
      hsn_sac: raw.hsn_sac,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      tax_amount: addMoney(cgst, sgst, igst),
    };
  });

  const taxable_amount = lines.reduce((sum, l) => addMoney(sum, l.taxable_amount), 0);
  const cgst_amount = lines.reduce((sum, l) => addMoney(sum, l.cgst_amount), 0);
  const sgst_amount = lines.reduce((sum, l) => addMoney(sum, l.sgst_amount), 0);
  const igst_amount = lines.reduce((sum, l) => addMoney(sum, l.igst_amount), 0);
  const tax_amount = addMoney(cgst_amount, sgst_amount, igst_amount);
  const total_amount = taxInclusive
    ? roundMoney(Math.max(0, addMoney(netBase, serviceCharges)))
    : roundMoney(Math.max(0, addMoney(taxable_amount, tax_amount, serviceCharges)));
  const hasTax = tax_amount > 0.009;

  return {
    is_inter_state: inter,
    place_of_supply: placeOfSupply,
    lines,
    subtotal,
    taxable_amount,
    cgst_amount,
    sgst_amount,
    igst_amount,
    tax_amount,
    discount_amount: discount,
    service_charges: serviceCharges,
    total_amount,
    suggested_invoice_type: hasTax ? 'invoice' : 'bos',
  };
}

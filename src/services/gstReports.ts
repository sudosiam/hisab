import { getDatabase } from '../db/database';
import { addMoney, roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import { getAdjustmentNotesForPeriod } from './adjustmentNotes';

export interface GstSummaryRow {
  outwardTaxable: number;
  outwardCgst: number;
  outwardSgst: number;
  outwardIgst: number;
  outwardTax: number;
  inwardTaxable: number;
  inwardCgst: number;
  inwardSgst: number;
  inwardIgst: number;
  inwardTax: number;
  netPayable: number;
}

export interface GstOutwardLine {
  id: number;
  date: string;
  invoice_no: string;
  invoice_type: string;
  party_name: string;
  party_gstin: string | null;
  supply_type: 'B2B' | 'B2C' | 'B2CL';
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface GstHsnLine {
  hsn_sac: string;
  gst_rate: number;
  qty: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
}

export interface GstInwardLine {
  id: number;
  date: string;
  invoice_no: string;
  supplier_name: string;
  party_gstin: string | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  is_reverse_charge: boolean;
}

export async function getGstSummary(periodKey: string): Promise<GstSummaryRow> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const outward = await db.getFirstAsync<{
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>(
    `SELECT
       COALESCE(SUM(COALESCE(taxable_amount, total_amount)), 0) as taxable,
       COALESCE(SUM(COALESCE(cgst_amount, 0)), 0) as cgst,
       COALESCE(SUM(COALESCE(sgst_amount, 0)), 0) as sgst,
       COALESCE(SUM(COALESCE(igst_amount, 0)), 0) as igst
     FROM sales
     WHERE date >= ? AND date <= ?
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = sales.id)
       AND COALESCE(cgst_amount, 0) + COALESCE(sgst_amount, 0) + COALESCE(igst_amount, 0) > 0.009`,
    [start, end]
  );

  const inward = await db.getFirstAsync<{
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>(
    `SELECT
       COALESCE(SUM(COALESCE(taxable_amount, total_amount)), 0) as taxable,
       COALESCE(SUM(COALESCE(cgst_amount, 0)), 0) as cgst,
       COALESCE(SUM(COALESCE(sgst_amount, 0)), 0) as sgst,
       COALESCE(SUM(COALESCE(igst_amount, 0)), 0) as igst
     FROM purchases
     WHERE date >= ? AND date <= ?
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = purchases.id)
       AND COALESCE(cgst_amount, 0) + COALESCE(sgst_amount, 0) + COALESCE(igst_amount, 0) > 0.009`,
    [start, end]
  );

  let outwardTaxable = roundMoney(outward?.taxable ?? 0);
  let outwardCgst = roundMoney(outward?.cgst ?? 0);
  let outwardSgst = roundMoney(outward?.sgst ?? 0);
  let outwardIgst = roundMoney(outward?.igst ?? 0);

  let inwardTaxable = roundMoney(inward?.taxable ?? 0);
  let inwardCgst = roundMoney(inward?.cgst ?? 0);
  let inwardSgst = roundMoney(inward?.sgst ?? 0);
  let inwardIgst = roundMoney(inward?.igst ?? 0);

  const notes = await getAdjustmentNotesForPeriod(periodKey);
  for (const note of notes) {
    const sign = note.note_kind === 'credit' ? -1 : 1;
    const taxable = roundMoney(note.taxable_amount ?? 0);
    const cgst = roundMoney(note.cgst_amount ?? 0);
    const sgst = roundMoney(note.sgst_amount ?? 0);
    const igst = roundMoney(note.igst_amount ?? 0);
    if (note.direction === 'sale') {
      outwardTaxable = roundMoney(outwardTaxable + sign * taxable);
      outwardCgst = roundMoney(outwardCgst + sign * cgst);
      outwardSgst = roundMoney(outwardSgst + sign * sgst);
      outwardIgst = roundMoney(outwardIgst + sign * igst);
    } else {
      inwardTaxable = roundMoney(inwardTaxable + sign * taxable);
      inwardCgst = roundMoney(inwardCgst + sign * cgst);
      inwardSgst = roundMoney(inwardSgst + sign * sgst);
      inwardIgst = roundMoney(inwardIgst + sign * igst);
    }
  }

  const outwardTax = addMoney(outwardCgst, outwardSgst, outwardIgst);
  const inwardTax = addMoney(inwardCgst, inwardSgst, inwardIgst);

  return {
    outwardTaxable,
    outwardCgst,
    outwardSgst,
    outwardIgst,
    outwardTax,
    inwardTaxable,
    inwardCgst,
    inwardSgst,
    inwardIgst,
    inwardTax,
    netPayable: roundMoney(outwardTax - inwardTax),
  };
}

export async function getGstOutwardSupplies(periodKey: string): Promise<GstOutwardLine[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const rows = await db.getAllAsync<{
    id: number;
    date: string;
    invoice_no: string;
    invoice_type: string | null;
    party_name: string;
    party_gstin: string | null;
    is_inter_state: number;
    taxable_amount: number | null;
    cgst_amount: number | null;
    sgst_amount: number | null;
    igst_amount: number | null;
    total_amount: number;
  }>(
    `SELECT s.id, s.date, s.invoice_no, s.invoice_type, s.party_name,
            p.gstin as party_gstin, s.is_inter_state,
            s.taxable_amount, s.cgst_amount, s.sgst_amount, s.igst_amount, s.total_amount
     FROM sales s
     LEFT JOIN parties p ON p.id = s.party_id
     WHERE s.date >= ? AND s.date <= ?
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
       AND COALESCE(s.cgst_amount, 0) + COALESCE(s.sgst_amount, 0) + COALESCE(s.igst_amount, 0) > 0.009
     ORDER BY s.date ASC, s.id ASC`,
    [start, end]
  );

  const saleLines: GstOutwardLine[] = rows.map((row) => {
    const taxable = roundMoney(row.taxable_amount ?? row.total_amount);
    const hasGstin = !!row.party_gstin?.trim();
    let supply_type: GstOutwardLine['supply_type'];
    if (hasGstin) {
      supply_type = 'B2B';
    } else if (row.is_inter_state && taxable >= 250000) {
      supply_type = 'B2CL';
    } else {
      supply_type = 'B2C';
    }
    return {
      id: row.id,
      date: row.date,
      invoice_no: row.invoice_no,
      invoice_type: row.invoice_type === 'bos' ? 'BOS' : 'Tax Invoice',
      party_name: row.party_name,
      party_gstin: row.party_gstin,
      supply_type,
      taxable_amount: taxable,
      cgst_amount: roundMoney(row.cgst_amount ?? 0),
      sgst_amount: roundMoney(row.sgst_amount ?? 0),
      igst_amount: roundMoney(row.igst_amount ?? 0),
      total_amount: roundMoney(row.total_amount),
    };
  });

  const noteRows = await db.getAllAsync<{
    id: number;
    date: string;
    note_no: string;
    note_kind: 'credit' | 'debit';
    party_name: string;
    party_gstin: string | null;
    is_inter_state: number;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_amount: number;
  }>(
    `SELECT n.id, n.date, n.note_no, n.note_kind, n.party_name,
            p.gstin as party_gstin, n.is_inter_state,
            n.taxable_amount, n.cgst_amount, n.sgst_amount, n.igst_amount, n.total_amount
     FROM adjustment_notes n
     LEFT JOIN parties p ON p.id = n.party_id
     WHERE n.direction = 'sale'
       AND n.date >= ? AND n.date <= ?
       AND COALESCE(n.cgst_amount, 0) + COALESCE(n.sgst_amount, 0) + COALESCE(n.igst_amount, 0) > 0.009
     ORDER BY n.date ASC, n.id ASC`,
    [start, end]
  );

  const noteLines: GstOutwardLine[] = noteRows.map((row) => {
    const sign = row.note_kind === 'credit' ? -1 : 1;
    const taxable = roundMoney(sign * (row.taxable_amount ?? 0));
    const hasGstin = !!row.party_gstin?.trim();
    let supply_type: GstOutwardLine['supply_type'];
    if (hasGstin) {
      supply_type = 'B2B';
    } else if (row.is_inter_state && Math.abs(taxable) >= 250000) {
      supply_type = 'B2CL';
    } else {
      supply_type = 'B2C';
    }
    return {
      id: -row.id,
      date: row.date,
      invoice_no: row.note_no,
      invoice_type: row.note_kind === 'credit' ? 'Credit Note' : 'Debit Note',
      party_name: row.party_name,
      party_gstin: row.party_gstin,
      supply_type,
      taxable_amount: taxable,
      cgst_amount: roundMoney(sign * (row.cgst_amount ?? 0)),
      sgst_amount: roundMoney(sign * (row.sgst_amount ?? 0)),
      igst_amount: roundMoney(sign * (row.igst_amount ?? 0)),
      total_amount: roundMoney(sign * (row.total_amount ?? 0)),
    };
  });

  return [...saleLines, ...noteLines].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.id - b.id;
  });
}

export async function getGstHsnSummary(periodKey: string): Promise<GstHsnLine[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const rows = await db.getAllAsync<{
    hsn_sac: string | null;
    gst_rate: number;
    qty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>(
    `SELECT COALESCE(NULLIF(TRIM(si.hsn_sac), ''), '—') as hsn_sac,
            COALESCE(si.gst_rate, 0) as gst_rate,
            COALESCE(SUM(si.qty), 0) as qty,
            COALESCE(SUM(COALESCE(si.taxable_amount, si.total)), 0) as taxable,
            COALESCE(SUM(COALESCE(si.cgst_amount, 0)), 0) as cgst,
            COALESCE(SUM(COALESCE(si.sgst_amount, 0)), 0) as sgst,
            COALESCE(SUM(COALESCE(si.igst_amount, 0)), 0) as igst
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.date >= ? AND s.date <= ?
       AND COALESCE(s.cgst_amount, 0) + COALESCE(s.sgst_amount, 0) + COALESCE(s.igst_amount, 0) > 0.009
     GROUP BY COALESCE(NULLIF(TRIM(si.hsn_sac), ''), '—'), COALESCE(si.gst_rate, 0)
     ORDER BY hsn_sac ASC, gst_rate ASC`,
    [start, end]
  );

  return rows.map((row) => {
    const cgst = roundMoney(row.cgst);
    const sgst = roundMoney(row.sgst);
    const igst = roundMoney(row.igst);
    return {
      hsn_sac: row.hsn_sac || '—',
      gst_rate: roundMoney(row.gst_rate),
      qty: roundMoney(row.qty),
      taxable_amount: roundMoney(row.taxable),
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      tax_amount: addMoney(cgst, sgst, igst),
    };
  });
}

export async function getGstInwardSupplies(periodKey: string): Promise<GstInwardLine[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const rows = await db.getAllAsync<{
    id: number;
    date: string;
    invoice_no: string;
    supplier_name: string;
    party_gstin: string | null;
    taxable_amount: number | null;
    cgst_amount: number | null;
    sgst_amount: number | null;
    igst_amount: number | null;
    total_amount: number;
    is_reverse_charge: number;
  }>(
    `SELECT p.id, p.date, p.invoice_no, p.supplier_name,
            pt.gstin as party_gstin,
            p.taxable_amount, p.cgst_amount, p.sgst_amount, p.igst_amount,
            p.total_amount, p.is_reverse_charge
     FROM purchases p
     LEFT JOIN parties pt ON pt.id = p.party_id
     WHERE p.date >= ? AND p.date <= ?
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
       AND COALESCE(p.cgst_amount, 0) + COALESCE(p.sgst_amount, 0) + COALESCE(p.igst_amount, 0) > 0.009
     ORDER BY p.date ASC, p.id ASC`,
    [start, end]
  );

  const purchaseLines: GstInwardLine[] = rows.map((row) => ({
    id: row.id,
    date: row.date,
    invoice_no: row.invoice_no,
    supplier_name: row.supplier_name,
    party_gstin: row.party_gstin,
    taxable_amount: roundMoney(row.taxable_amount ?? row.total_amount),
    cgst_amount: roundMoney(row.cgst_amount ?? 0),
    sgst_amount: roundMoney(row.sgst_amount ?? 0),
    igst_amount: roundMoney(row.igst_amount ?? 0),
    total_amount: roundMoney(row.total_amount),
    is_reverse_charge: !!row.is_reverse_charge,
  }));

  const noteRows = await db.getAllAsync<{
    id: number;
    date: string;
    note_no: string;
    note_kind: 'credit' | 'debit';
    party_name: string;
    party_gstin: string | null;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_amount: number;
    is_reverse_charge: number;
  }>(
    `SELECT n.id, n.date, n.note_no, n.note_kind, n.party_name,
            p.gstin as party_gstin,
            n.taxable_amount, n.cgst_amount, n.sgst_amount, n.igst_amount,
            n.total_amount, n.is_reverse_charge
     FROM adjustment_notes n
     LEFT JOIN parties p ON p.id = n.party_id
     WHERE n.direction = 'purchase'
       AND n.date >= ? AND n.date <= ?
       AND COALESCE(n.cgst_amount, 0) + COALESCE(n.sgst_amount, 0) + COALESCE(n.igst_amount, 0) > 0.009
     ORDER BY n.date ASC, n.id ASC`,
    [start, end]
  );

  const noteLines: GstInwardLine[] = noteRows.map((row) => {
    const sign = row.note_kind === 'credit' ? -1 : 1;
    return {
      id: -row.id,
      date: row.date,
      invoice_no: row.note_no,
      supplier_name: row.party_name,
      party_gstin: row.party_gstin,
      taxable_amount: roundMoney(sign * (row.taxable_amount ?? 0)),
      cgst_amount: roundMoney(sign * (row.cgst_amount ?? 0)),
      sgst_amount: roundMoney(sign * (row.sgst_amount ?? 0)),
      igst_amount: roundMoney(sign * (row.igst_amount ?? 0)),
      total_amount: roundMoney(sign * (row.total_amount ?? 0)),
      is_reverse_charge: !!row.is_reverse_charge,
    };
  });

  return [...purchaseLines, ...noteLines].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.id - b.id;
  });
}

export interface GstStateWiseRow {
  state_code: string;
  state_label: string;
  invoice_count: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
  total_amount: number;
}

export async function getGstCustomersByState(periodKey: string): Promise<GstStateWiseRow[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);
  const { stateName } = await import('./gst');

  const rows = await db.getAllAsync<{
    state_code: string | null;
    invoice_count: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>(
    `SELECT
       COALESCE(NULLIF(TRIM(s.place_of_supply), ''), NULLIF(TRIM(p.state), ''), '—') as state_code,
       COUNT(*) as invoice_count,
       COALESCE(SUM(COALESCE(s.taxable_amount, s.total_amount)), 0) as taxable,
       COALESCE(SUM(COALESCE(s.cgst_amount, 0)), 0) as cgst,
       COALESCE(SUM(COALESCE(s.sgst_amount, 0)), 0) as sgst,
       COALESCE(SUM(COALESCE(s.igst_amount, 0)), 0) as igst,
       COALESCE(SUM(s.total_amount), 0) as total
     FROM sales s
     LEFT JOIN parties p ON p.id = s.party_id
     WHERE s.date >= ? AND s.date <= ?
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
     GROUP BY COALESCE(NULLIF(TRIM(s.place_of_supply), ''), NULLIF(TRIM(p.state), ''), '—')
     ORDER BY total DESC`,
    [start, end]
  );

  return rows.map((row) => {
    const code = row.state_code || '—';
    const cgst = roundMoney(row.cgst);
    const sgst = roundMoney(row.sgst);
    const igst = roundMoney(row.igst);
    return {
      state_code: code,
      state_label: code === '—' ? 'Unspecified' : stateName(code) || code,
      invoice_count: row.invoice_count,
      taxable_amount: roundMoney(row.taxable),
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      tax_amount: addMoney(cgst, sgst, igst),
      total_amount: roundMoney(row.total),
    };
  });
}

export interface VendorAccountPurchaseRow {
  vendor_name: string;
  party_id: number | null;
  bill_count: number;
  taxable_amount: number;
  input_tax: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  accounts: { account_name: string; paid: number }[];
}

export async function getPurchasesByVendorAccount(
  periodKey: string
): Promise<VendorAccountPurchaseRow[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const vendors = await db.getAllAsync<{
    party_id: number | null;
    vendor_name: string;
    bill_count: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    paid: number;
  }>(
    `SELECT
       COALESCE(MAX(p.party_id), NULL) as party_id,
       p.supplier_name as vendor_name,
       COUNT(*) as bill_count,
       COALESCE(SUM(COALESCE(p.taxable_amount, p.total_amount)), 0) as taxable,
       COALESCE(SUM(COALESCE(p.cgst_amount, 0)), 0) as cgst,
       COALESCE(SUM(COALESCE(p.sgst_amount, 0)), 0) as sgst,
       COALESCE(SUM(COALESCE(p.igst_amount, 0)), 0) as igst,
       COALESCE(SUM(p.total_amount), 0) as total,
       COALESCE(SUM(p.paid_amount), 0) as paid
     FROM purchases p
     WHERE p.date >= ? AND p.date <= ?
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
     GROUP BY p.supplier_name COLLATE NOCASE
     ORDER BY total DESC`,
    [start, end]
  );

  const accountRows = await db.getAllAsync<{
    vendor_name: string;
    account_name: string;
    paid: number;
  }>(
    `SELECT
       p.supplier_name as vendor_name,
       a.name as account_name,
       COALESCE(SUM(pp.amount), 0) as paid
     FROM purchase_payments pp
     JOIN purchases p ON p.id = pp.purchase_id
     JOIN accounts a ON a.id = pp.account_id
     WHERE p.date >= ? AND p.date <= ?
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
     GROUP BY p.supplier_name COLLATE NOCASE, a.id, a.name
     HAVING paid > 0
     ORDER BY paid DESC`,
    [start, end]
  );

  const accountsByVendor = new Map<string, { account_name: string; paid: number }[]>();
  for (const row of accountRows) {
    const key = row.vendor_name.toLowerCase();
    const list = accountsByVendor.get(key) ?? [];
    list.push({
      account_name: row.account_name,
      paid: roundMoney(row.paid),
    });
    accountsByVendor.set(key, list);
  }

  return vendors.map((vendor) => {
    const inputTax = addMoney(vendor.cgst, vendor.sgst, vendor.igst);
    return {
      vendor_name: vendor.vendor_name,
      party_id: vendor.party_id,
      bill_count: vendor.bill_count,
      taxable_amount: roundMoney(vendor.taxable),
      input_tax: roundMoney(inputTax),
      total_amount: roundMoney(vendor.total),
      paid_amount: roundMoney(vendor.paid),
      due_amount: roundMoney(vendor.total - vendor.paid),
      accounts: accountsByVendor.get(vendor.vendor_name.toLowerCase()) ?? [],
    };
  });
}

import { getDatabase } from '../db/database';
import { addMoney, roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';

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
  supply_type: 'B2B' | 'B2C';
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface GstHsnLine {
  hsn_sac: string;
  qty: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
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

  const outwardTaxable = roundMoney(outward?.taxable ?? 0);
  const outwardCgst = roundMoney(outward?.cgst ?? 0);
  const outwardSgst = roundMoney(outward?.sgst ?? 0);
  const outwardIgst = roundMoney(outward?.igst ?? 0);
  const outwardTax = addMoney(outwardCgst, outwardSgst, outwardIgst);

  const inwardTaxable = roundMoney(inward?.taxable ?? 0);
  const inwardCgst = roundMoney(inward?.cgst ?? 0);
  const inwardSgst = roundMoney(inward?.sgst ?? 0);
  const inwardIgst = roundMoney(inward?.igst ?? 0);
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
    taxable_amount: number | null;
    cgst_amount: number | null;
    sgst_amount: number | null;
    igst_amount: number | null;
    total_amount: number;
  }>(
    `SELECT s.id, s.date, s.invoice_no, s.invoice_type, s.party_name,
            p.gstin as party_gstin,
            s.taxable_amount, s.cgst_amount, s.sgst_amount, s.igst_amount, s.total_amount
     FROM sales s
     LEFT JOIN parties p ON p.id = s.party_id
     WHERE s.date >= ? AND s.date <= ?
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
     ORDER BY s.date ASC, s.id ASC`,
    [start, end]
  );

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    invoice_no: row.invoice_no,
    invoice_type: row.invoice_type === 'bos' ? 'BOS' : 'Tax Invoice',
    party_name: row.party_name,
    party_gstin: row.party_gstin,
    supply_type: row.party_gstin?.trim() ? 'B2B' : 'B2C',
    taxable_amount: roundMoney(row.taxable_amount ?? row.total_amount),
    cgst_amount: roundMoney(row.cgst_amount ?? 0),
    sgst_amount: roundMoney(row.sgst_amount ?? 0),
    igst_amount: roundMoney(row.igst_amount ?? 0),
    total_amount: roundMoney(row.total_amount),
  }));
}

export async function getGstHsnSummary(periodKey: string): Promise<GstHsnLine[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const rows = await db.getAllAsync<{
    hsn_sac: string | null;
    qty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>(
    `SELECT COALESCE(NULLIF(TRIM(si.hsn_sac), ''), '—') as hsn_sac,
            COALESCE(SUM(si.qty), 0) as qty,
            COALESCE(SUM(COALESCE(si.taxable_amount, si.total)), 0) as taxable,
            COALESCE(SUM(COALESCE(si.cgst_amount, 0)), 0) as cgst,
            COALESCE(SUM(COALESCE(si.sgst_amount, 0)), 0) as sgst,
            COALESCE(SUM(COALESCE(si.igst_amount, 0)), 0) as igst
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.date >= ? AND s.date <= ?
     GROUP BY COALESCE(NULLIF(TRIM(si.hsn_sac), ''), '—')
     ORDER BY hsn_sac ASC`,
    [start, end]
  );

  return rows.map((row) => {
    const cgst = roundMoney(row.cgst);
    const sgst = roundMoney(row.sgst);
    const igst = roundMoney(row.igst);
    return {
      hsn_sac: row.hsn_sac || '—',
      qty: roundMoney(row.qty),
      taxable_amount: roundMoney(row.taxable),
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      tax_amount: addMoney(cgst, sgst, igst),
    };
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

  const result: VendorAccountPurchaseRow[] = [];
  for (const vendor of vendors) {
    const accounts = await db.getAllAsync<{ account_name: string; paid: number }>(
      `SELECT a.name as account_name, COALESCE(SUM(pp.amount), 0) as paid
       FROM purchase_payments pp
       JOIN purchases p ON p.id = pp.purchase_id
       JOIN accounts a ON a.id = pp.account_id
       WHERE p.date >= ? AND p.date <= ?
         AND p.supplier_name = ? COLLATE NOCASE
       GROUP BY a.id, a.name
       HAVING paid > 0
       ORDER BY paid DESC`,
      [start, end, vendor.vendor_name]
    );

    const inputTax = addMoney(vendor.cgst, vendor.sgst, vendor.igst);
    result.push({
      vendor_name: vendor.vendor_name,
      party_id: vendor.party_id,
      bill_count: vendor.bill_count,
      taxable_amount: roundMoney(vendor.taxable),
      input_tax: roundMoney(inputTax),
      total_amount: roundMoney(vendor.total),
      paid_amount: roundMoney(vendor.paid),
      due_amount: roundMoney(vendor.total - vendor.paid),
      accounts: accounts.map((a) => ({
        account_name: a.account_name,
        paid: roundMoney(a.paid),
      })),
    });
  }
  return result;
}

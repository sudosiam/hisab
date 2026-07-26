import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '../db/database';
import { addMoney, roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import { deferDeleteCacheFile } from '../utils/tempShareFiles';
import { getAdjustmentNotesForPeriod } from './adjustmentNotes';
import { getBusinessGstin } from './appSettings';
import {
  getGstHsnSummary,
  getGstOutwardSupplies,
  getGstSummary,
  type GstOutwardLine,
} from './gstReports';

const DISCLAIMER =
  'Helper only — not for official filing. Verify all figures before submitting GSTR.';

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function outwardRow(line: GstOutwardLine): (string | number)[] {
  return [
    line.date,
    line.invoice_no,
    line.party_name,
    line.party_gstin ?? '',
    line.taxable_amount,
    line.cgst_amount,
    line.sgst_amount,
    line.igst_amount,
    line.total_amount,
  ];
}

interface B2csAggregateRow {
  place_of_supply: string;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
}

async function getB2csAggregates(periodKey: string): Promise<B2csAggregateRow[]> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const rows = await db.getAllAsync<{
    place_of_supply: string;
    gst_rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>(
    `SELECT
       COALESCE(NULLIF(TRIM(s.place_of_supply), ''), NULLIF(TRIM(p.state), ''), '—') as place_of_supply,
       COALESCE(si.gst_rate, 0) as gst_rate,
       COALESCE(SUM(COALESCE(si.taxable_amount, si.total)), 0) as taxable,
       COALESCE(SUM(COALESCE(si.cgst_amount, 0)), 0) as cgst,
       COALESCE(SUM(COALESCE(si.sgst_amount, 0)), 0) as sgst,
       COALESCE(SUM(COALESCE(si.igst_amount, 0)), 0) as igst
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN parties p ON p.id = s.party_id
     WHERE s.date >= ? AND s.date <= ?
       AND EXISTS (SELECT 1 FROM sale_items x WHERE x.sale_id = s.id)
       AND COALESCE(s.cgst_amount, 0) + COALESCE(s.sgst_amount, 0) + COALESCE(s.igst_amount, 0) > 0.009
       AND (p.gstin IS NULL OR TRIM(p.gstin) = '')
       AND NOT (
         s.is_inter_state = 1
         AND COALESCE(s.taxable_amount, s.total_amount) >= 250000
       )
     GROUP BY
       COALESCE(NULLIF(TRIM(s.place_of_supply), ''), NULLIF(TRIM(p.state), ''), '—'),
       COALESCE(si.gst_rate, 0)
     ORDER BY place_of_supply ASC, gst_rate ASC`,
    [start, end]
  );

  return rows.map((row) => {
    const cgst = roundMoney(row.cgst);
    const sgst = roundMoney(row.sgst);
    const igst = roundMoney(row.igst);
    return {
      place_of_supply: row.place_of_supply,
      gst_rate: roundMoney(row.gst_rate),
      taxable_amount: roundMoney(row.taxable),
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      tax_amount: addMoney(cgst, sgst, igst),
    };
  });
}

interface RcmSummary {
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
}

async function getRcmSummary(periodKey: string): Promise<RcmSummary> {
  const db = await getDatabase();
  const { start, end } = await resolvePeriodRange(periodKey);

  const row = await db.getFirstAsync<{
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
       AND is_reverse_charge = 1
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = purchases.id)
       AND COALESCE(cgst_amount, 0) + COALESCE(sgst_amount, 0) + COALESCE(igst_amount, 0) > 0.009`,
    [start, end]
  );

  const cgst = roundMoney(row?.cgst ?? 0);
  const sgst = roundMoney(row?.sgst ?? 0);
  const igst = roundMoney(row?.igst ?? 0);

  return {
    taxable_amount: roundMoney(row?.taxable ?? 0),
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    tax_amount: addMoney(cgst, sgst, igst),
  };
}

async function buildMeta(form: string, periodKey: string) {
  const business_gstin = await getBusinessGstin();
  return {
    form,
    periodKey,
    business_gstin,
    generated_at: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}

async function shareJsonFile(fileName: string, payload: object): Promise<void> {
  const json = JSON.stringify(payload, null, 2);
  const exportPath = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(exportPath, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    await FileSystem.deleteAsync(exportPath, { idempotent: true });
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(exportPath, {
    mimeType: 'application/json',
    dialogTitle: `Share ${fileName}`,
  });
  deferDeleteCacheFile(exportPath);
}

export async function buildGstr1Helper(
  periodKey: string
): Promise<{ json: object; csvParts: { name: string; csv: string }[] }> {
  const [outward, hsn, notes, b2cs] = await Promise.all([
    getGstOutwardSupplies(periodKey),
    getGstHsnSummary(periodKey),
    getAdjustmentNotesForPeriod(periodKey),
    getB2csAggregates(periodKey),
  ]);

  const b2b = outward.filter((line) => line.supply_type === 'B2B');
  const b2cl = outward.filter((line) => line.supply_type === 'B2CL');

  const cdnr = notes
    .filter((note) => note.direction === 'sale')
    .map((note) => {
      const sign = note.note_kind === 'credit' ? -1 : 1;
      return {
        id: note.id,
        date: note.date,
        note_no: note.note_no,
        note_kind: note.note_kind,
        party_name: note.party_name,
        against_sale_id: note.against_sale_id,
        sign,
        taxable_amount: roundMoney(sign * (note.taxable_amount ?? 0)),
        cgst_amount: roundMoney(sign * (note.cgst_amount ?? 0)),
        sgst_amount: roundMoney(sign * (note.sgst_amount ?? 0)),
        igst_amount: roundMoney(sign * (note.igst_amount ?? 0)),
        total_amount: roundMoney(sign * (note.total_amount ?? 0)),
      };
    });

  const meta = await buildMeta('GSTR-1-helper', periodKey);

  const json = {
    meta,
    b2b,
    b2cl,
    b2cs,
    cdnr,
    hsn,
  };

  const outwardHeaders = [
    'date',
    'invoice_no',
    'party_name',
    'party_gstin',
    'taxable_amount',
    'cgst_amount',
    'sgst_amount',
    'igst_amount',
    'total_amount',
  ];

  const csvParts = [
    {
      name: 'b2b.csv',
      csv: rowsToCsv(
        outwardHeaders,
        b2b.map((line) => outwardRow(line))
      ),
    },
    {
      name: 'b2cl.csv',
      csv: rowsToCsv(
        outwardHeaders,
        b2cl.map((line) => outwardRow(line))
      ),
    },
    {
      name: 'b2cs.csv',
      csv: rowsToCsv(
        [
          'place_of_supply',
          'gst_rate',
          'taxable_amount',
          'cgst_amount',
          'sgst_amount',
          'igst_amount',
          'tax_amount',
        ],
        b2cs.map((row) => [
          row.place_of_supply,
          row.gst_rate,
          row.taxable_amount,
          row.cgst_amount,
          row.sgst_amount,
          row.igst_amount,
          row.tax_amount,
        ])
      ),
    },
    {
      name: 'cdnr.csv',
      csv: rowsToCsv(
        [
          'date',
          'note_no',
          'note_kind',
          'party_name',
          'against_sale_id',
          'sign',
          'taxable_amount',
          'cgst_amount',
          'sgst_amount',
          'igst_amount',
          'total_amount',
        ],
        cdnr.map((row) => [
          row.date,
          row.note_no,
          row.note_kind,
          row.party_name,
          row.against_sale_id ?? '',
          row.sign,
          row.taxable_amount,
          row.cgst_amount,
          row.sgst_amount,
          row.igst_amount,
          row.total_amount,
        ])
      ),
    },
    {
      name: 'hsn.csv',
      csv: rowsToCsv(
        [
          'hsn_sac',
          'gst_rate',
          'qty',
          'taxable_amount',
          'cgst_amount',
          'sgst_amount',
          'igst_amount',
          'tax_amount',
        ],
        hsn.map((row) => [
          row.hsn_sac,
          row.gst_rate,
          row.qty,
          row.taxable_amount,
          row.cgst_amount,
          row.sgst_amount,
          row.igst_amount,
          row.tax_amount,
        ])
      ),
    },
  ];

  return { json, csvParts };
}

export async function buildGstr3bHelper(
  periodKey: string
): Promise<{ json: object; csv: string }> {
  const [summary, rcm] = await Promise.all([getGstSummary(periodKey), getRcmSummary(periodKey)]);

  const meta = await buildMeta('GSTR-3B-helper', periodKey);

  const json = {
    meta,
    outward: {
      taxable_amount: summary.outwardTaxable,
      cgst_amount: summary.outwardCgst,
      sgst_amount: summary.outwardSgst,
      igst_amount: summary.outwardIgst,
      tax_amount: summary.outwardTax,
    },
    inward: {
      taxable_amount: summary.inwardTaxable,
      cgst_amount: summary.inwardCgst,
      sgst_amount: summary.inwardSgst,
      igst_amount: summary.inwardIgst,
      tax_amount: summary.inwardTax,
    },
    rcm,
    net_payable: summary.netPayable,
    disclaimer: 'Helper only — verify before filing',
  };

  const csv = rowsToCsv(
    ['section', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'tax_amount'],
    [
      [
        'Outward supplies',
        summary.outwardTaxable,
        summary.outwardCgst,
        summary.outwardSgst,
        summary.outwardIgst,
        summary.outwardTax,
      ],
      [
        'Inward supplies (ITC)',
        summary.inwardTaxable,
        summary.inwardCgst,
        summary.inwardSgst,
        summary.inwardIgst,
        summary.inwardTax,
      ],
      [
        'Reverse charge (RCM)',
        rcm.taxable_amount,
        rcm.cgst_amount,
        rcm.sgst_amount,
        rcm.igst_amount,
        rcm.tax_amount,
      ],
      ['Net payable / (credit)', '', '', '', '', summary.netPayable],
    ]
  );

  return { json, csv };
}

export async function shareGstr1Helper(periodKey: string): Promise<void> {
  const { json } = await buildGstr1Helper(periodKey);
  await shareJsonFile(`GSTR1-helper-${periodKey}.json`, json);
}

export async function shareGstr3bHelper(periodKey: string): Promise<void> {
  const { json } = await buildGstr3bHelper(periodKey);
  await shareJsonFile(`GSTR3B-helper-${periodKey}.json`, json);
}

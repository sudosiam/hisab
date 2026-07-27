import { getDatabase } from '../db/database';
import { formatInvoiceSequence } from './invoiceNumbers';
import { upsertParty } from './parties';
import { computeUntaxedDocument } from './documentTotals';
import { roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import type {
  AdjustmentNote,
  AdjustmentNoteDirection,
  AdjustmentNoteItem,
  AdjustmentNoteItemInput,
  AdjustmentNoteKind,
  PartyType,
  Purchase,
  Sale,
} from '../types';

const NOTE_PREFIX: Record<AdjustmentNoteKind, string> = {
  credit: 'CN',
  debit: 'DN',
};

function validateAdjustmentNoteItems(items: AdjustmentNoteItemInput[]): void {
  if (items.length === 0) throw new Error('Add at least one item');
  for (const item of items) {
    if (item.qty <= 0) throw new Error('Item quantity must be greater than zero');
    if (item.unit_price <= 0) throw new Error('Item unit price must be greater than zero');
  }
}

async function getMaxNoteSequence(kind: AdjustmentNoteKind): Promise<number> {
  const db = await getDatabase();
  const stem = NOTE_PREFIX[kind];
  const stemUpper = stem.trim().toUpperCase();
  const prefixLen = stemUpper.length;
  const dashPos = prefixLen + 1;
  const numStart = prefixLen + 2;

  const row = await db.getFirstAsync<{ max_seq: number | null }>(
    `SELECT MAX(CAST(SUBSTR(note_no, ?) AS INTEGER)) AS max_seq
     FROM adjustment_notes
     WHERE note_kind = ?
       AND UPPER(SUBSTR(note_no, 1, ?)) = ?
       AND SUBSTR(note_no, ?, 1) = '-'
       AND SUBSTR(note_no, ?) GLOB '[0-9]*'
       AND LENGTH(note_no) >= ?`,
    [numStart, kind, prefixLen, stemUpper, dashPos, numStart, numStart]
  );
  const max = row?.max_seq;
  return typeof max === 'number' && Number.isFinite(max) ? max : 0;
}

export async function resolveNextNoteNo(kind: AdjustmentNoteKind): Promise<string> {
  const stem = NOTE_PREFIX[kind];
  const maxDb = await getMaxNoteSequence(kind);
  const sequence = maxDb + 1;
  const digitWidth = Math.max(4, String(sequence).length);
  return formatInvoiceSequence(stem, sequence, digitWidth);
}

type AgainstDocumentDefaults = {
  party_id: number | null;
  party_name: string;
};

async function loadAgainstDocumentDefaults(
  db: Awaited<ReturnType<typeof getDatabase>>,
  direction: AdjustmentNoteDirection,
  againstSaleId?: number | null,
  againstPurchaseId?: number | null
): Promise<AgainstDocumentDefaults | null> {
  if (direction === 'sale' && againstSaleId) {
    const sale = await db.getFirstAsync<Sale>('SELECT * FROM sales WHERE id = ?', [againstSaleId]);
    if (!sale) throw new Error('Linked sale not found');
    return {
      party_id: sale.party_id,
      party_name: sale.party_name,
    };
  }
  if (direction === 'purchase' && againstPurchaseId) {
    const purchase = await db.getFirstAsync<Purchase>('SELECT * FROM purchases WHERE id = ?', [
      againstPurchaseId,
    ]);
    if (!purchase) throw new Error('Linked purchase not found');
    return {
      party_id: purchase.party_id,
      party_name: purchase.supplier_name,
    };
  }
  return null;
}

function assertDirectionLinks(
  direction: AdjustmentNoteDirection,
  againstSaleId?: number | null,
  againstPurchaseId?: number | null
): void {
  if (direction === 'sale' && againstPurchaseId) {
    throw new Error('Purchase invoice cannot be linked to a sale adjustment note');
  }
  if (direction === 'purchase' && againstSaleId) {
    throw new Error('Sale invoice cannot be linked to a purchase adjustment note');
  }
}

export async function createAdjustmentNote(params: {
  note_kind: AdjustmentNoteKind;
  direction: AdjustmentNoteDirection;
  against_sale_id?: number | null;
  against_purchase_id?: number | null;
  party_name: string;
  party_id?: number | null;
  date: string;
  reason?: string;
  notes?: string;
  is_reverse_charge?: boolean;
  items: AdjustmentNoteItemInput[];
}): Promise<number> {
  validateAdjustmentNoteItems(params.items);
  assertDirectionLinks(params.direction, params.against_sale_id, params.against_purchase_id);

  const db = await getDatabase();
  const againstDefaults = await loadAgainstDocumentDefaults(
    db,
    params.direction,
    params.against_sale_id,
    params.against_purchase_id
  );

  const partyType: PartyType = params.direction === 'sale' ? 'customer' : 'vendor';
  const partyName = params.party_name.trim() || againstDefaults?.party_name || '';
  if (!partyName) throw new Error('Party name is required');

  const partyId = params.party_id ?? againstDefaults?.party_id ?? null;

  const totals = computeUntaxedDocument({
    lines: params.items.map((item) => ({
      qty: item.qty,
      unit_price: item.unit_price,
      hsn_sac: item.hsn_sac,
    })),
    discount_amount: 0,
    service_charges: 0,
  });

  const taxableAmount = roundMoney(totals.taxable_amount);
  const totalAmount = roundMoney(totals.total_amount);

  let noteId = 0;

  await db.withTransactionAsync(async () => {
    const noteNo = await resolveNextNoteNo(params.note_kind);
    const resolvedPartyId = await upsertParty(partyName, partyType, db);

    const result = await db.runAsync(
      `INSERT INTO adjustment_notes (
         note_no, note_kind, direction, against_sale_id, against_purchase_id,
         party_id, party_name, date, reason,
         taxable_amount, cgst_amount, sgst_amount, igst_amount,
         is_inter_state, place_of_supply, is_reverse_charge,
         total_amount, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        noteNo,
        params.note_kind,
        params.direction,
        params.direction === 'sale' ? params.against_sale_id ?? null : null,
        params.direction === 'purchase' ? params.against_purchase_id ?? null : null,
        resolvedPartyId ?? partyId,
        partyName,
        params.date,
        params.reason?.trim() || null,
        taxableAmount,
        0,
        0,
        0,
        0,
        null,
        0,
        totalAmount,
        params.notes?.trim() || null,
      ]
    );
    noteId = result.lastInsertRowId;

    for (let i = 0; i < params.items.length; i++) {
      const item = params.items[i];
      const line = totals.lines[i];
      await db.runAsync(
        `INSERT INTO adjustment_note_items (
           note_id, product_id, description, qty, unit_price, total,
           hsn_sac, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          noteId,
          item.product_id ?? null,
          item.description?.trim() || null,
          item.qty,
          roundMoney(item.unit_price),
          roundMoney(line.line_total),
          line.hsn_sac,
          0,
          roundMoney(line.taxable_amount),
          0,
          0,
          0,
        ]
      );
    }
  });

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh({ type: 'adjustment_note', id: noteId });
  } catch {
    // Note is saved; ledger refresh is best-effort housekeeping.
  }

  return noteId;
}

export async function getAdjustmentNoteById(id: number): Promise<AdjustmentNote | null> {
  const db = await getDatabase();
  return db.getFirstAsync<AdjustmentNote>('SELECT * FROM adjustment_notes WHERE id = ?', [id]);
}

export async function getAdjustmentNoteItems(noteId: number): Promise<AdjustmentNoteItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<AdjustmentNoteItem>(
    `SELECT ani.*, p.name AS product_name
     FROM adjustment_note_items ani
     LEFT JOIN products p ON p.id = ani.product_id
     WHERE ani.note_id = ?
     ORDER BY ani.id`,
    [noteId]
  );
}

export async function listAdjustmentNotes(filters?: {
  direction?: AdjustmentNoteDirection;
  kind?: AdjustmentNoteKind;
  periodKey?: string;
}): Promise<AdjustmentNote[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.direction) {
    conditions.push('direction = ?');
    params.push(filters.direction);
  }
  if (filters?.kind) {
    conditions.push('note_kind = ?');
    params.push(filters.kind);
  }
  if (filters?.periodKey) {
    const { start, end } = await resolvePeriodRange(filters.periodKey);
    conditions.push('date >= ? AND date <= ?');
    params.push(start, end);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.getAllAsync<AdjustmentNote>(
    `SELECT * FROM adjustment_notes ${where} ORDER BY date DESC, id DESC`,
    params
  );
}

export async function getAdjustmentNotesForPeriod(periodKey: string): Promise<AdjustmentNote[]> {
  return listAdjustmentNotes({ periodKey });
}

export async function deleteAdjustmentNote(id: number): Promise<void> {
  const db = await getDatabase();
  const note = await getAdjustmentNoteById(id);
  if (!note) throw new Error('Adjustment note not found');

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM adjustment_notes WHERE id = ?', [id]);
  });

  try {
    const { scheduleGeneralLedgerRefresh } = await import('./ledger');
    scheduleGeneralLedgerRefresh({ type: 'adjustment_note', id });
  } catch {
    // The note was deleted; ledger refresh is best-effort housekeeping.
  }
}

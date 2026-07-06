import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';
import type * as SQLite from 'expo-sqlite';
import type {
  Party,
  PartyHistoryItem,
  PartyStatementLine,
  PartySummary,
  PartyType,
  PartyWithSummary,
} from '../types';

export async function getParties(filter?: PartyType | 'all'): Promise<Party[]> {
  const db = await getDatabase();
  if (filter && filter !== 'all') {
    return db.getAllAsync<Party>(
      'SELECT * FROM parties WHERE type = ? ORDER BY name ASC',
      [filter]
    );
  }
  return db.getAllAsync<Party>('SELECT * FROM parties ORDER BY type ASC, name ASC');
}

export async function getPartiesWithSummary(): Promise<PartyWithSummary[]> {
  const db = await getDatabase();
  const customers = await db.getAllAsync<PartyWithSummary>(`
    SELECT p.*,
      COUNT(s.id) as invoice_count,
      COALESCE(SUM(s.total_amount - s.paid_amount), 0) as balance_due,
      MAX(s.date) as last_activity
    FROM parties p
    LEFT JOIN sales s ON s.party_name = p.name COLLATE NOCASE
    WHERE p.type = 'customer'
    GROUP BY p.id
  `);
  const vendors = await db.getAllAsync<PartyWithSummary>(`
    SELECT p.*,
      COUNT(pu.id) as invoice_count,
      COALESCE(SUM(pu.total_amount - pu.paid_amount), 0) as balance_due,
      MAX(pu.date) as last_activity
    FROM parties p
    LEFT JOIN purchases pu ON pu.supplier_name = p.name COLLATE NOCASE
    WHERE p.type = 'vendor'
    GROUP BY p.id
  `);
  return [...customers, ...vendors].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });
}

export async function getPartySummary(partyId: number): Promise<PartySummary | null> {
  const party = await getPartyById(partyId);
  if (!party) return null;

  const db = await getDatabase();
  if (party.type === 'customer') {
    const stats = await db.getFirstAsync<{
      count: number;
      billed: number;
      paid: number;
      due: number;
      last_date: string | null;
    }>(
      `SELECT COUNT(*) as count,
              COALESCE(SUM(total_amount), 0) as billed,
              COALESCE(SUM(paid_amount), 0) as paid,
              COALESCE(SUM(total_amount - paid_amount), 0) as due,
              MAX(date) as last_date
       FROM sales WHERE party_name = ? COLLATE NOCASE`,
      [party.name]
    );
    return {
      party,
      invoiceCount: stats?.count ?? 0,
      totalBilled: stats?.billed ?? 0,
      totalPaid: stats?.paid ?? 0,
      balanceDue: stats?.due ?? 0,
      lastActivityDate: stats?.last_date ?? null,
    };
  }

  const stats = await db.getFirstAsync<{
    count: number;
    billed: number;
    paid: number;
    due: number;
    last_date: string | null;
  }>(
    `SELECT COUNT(*) as count,
            COALESCE(SUM(total_amount), 0) as billed,
            COALESCE(SUM(paid_amount), 0) as paid,
            COALESCE(SUM(total_amount - paid_amount), 0) as due,
            MAX(date) as last_date
     FROM purchases WHERE supplier_name = ? COLLATE NOCASE`,
    [party.name]
  );
  return {
    party,
    invoiceCount: stats?.count ?? 0,
    totalBilled: stats?.billed ?? 0,
    totalPaid: stats?.paid ?? 0,
    balanceDue: stats?.due ?? 0,
    lastActivityDate: stats?.last_date ?? null,
  };
}

export async function getPartyStatement(partyId: number): Promise<PartyStatementLine[]> {
  const party = await getPartyById(partyId);
  if (!party) return [];

  const db = await getDatabase();

  // Uniform same-day sort key: invoices/bills ('0') come before payments
  // ('1'), then by row id. Mixing created_at timestamps with other formats
  // produced wrong ordering for backdated entries.
  const sortKey = (kind: '0' | '1', id: number): string =>
    `${kind}#${String(id).padStart(12, '0')}`;

  type RawEntry = {
    sort_date: string;
    sort_created: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    reference_type: 'sale' | 'purchase' | 'payment';
    reference_id: number;
  };
  const entries: RawEntry[] = [];

  if (party.type === 'customer') {
    const sales = await db.getAllAsync<{
      id: number;
      invoice_no: string;
      date: string;
      total_amount: number;
      created_at: string;
    }>(
      `SELECT id, invoice_no, date, total_amount, created_at
       FROM sales WHERE party_name = ? COLLATE NOCASE`,
      [party.name]
    );
    for (const sale of sales) {
      entries.push({
        sort_date: sale.date,
        sort_created: sortKey('0', sale.id),
        date: sale.date,
        description: `Invoice ${sale.invoice_no}`,
        debit: sale.total_amount,
        credit: 0,
        reference_type: 'sale',
        reference_id: sale.id,
      });
    }

    const payments = await db.getAllAsync<{
      sale_id: number;
      amount: number;
      date: string;
      payment_id: number;
      invoice_no: string;
    }>(
      `SELECT sp.sale_id, sp.amount, sp.date, sp.id as payment_id, s.invoice_no
       FROM sale_payments sp
       JOIN sales s ON s.id = sp.sale_id
       WHERE s.party_name = ? COLLATE NOCASE`,
      [party.name]
    );
    for (const payment of payments) {
      entries.push({
        sort_date: payment.date,
        sort_created: sortKey('1', payment.payment_id),
        date: payment.date,
        description: `Payment — ${payment.invoice_no}`,
        debit: 0,
        credit: payment.amount,
        reference_type: 'payment',
        reference_id: payment.sale_id,
      });
    }
  } else {
    const purchases = await db.getAllAsync<{
      id: number;
      invoice_no: string;
      date: string;
      total_amount: number;
      created_at: string;
    }>(
      `SELECT id, invoice_no, date, total_amount, created_at
       FROM purchases WHERE supplier_name = ? COLLATE NOCASE`,
      [party.name]
    );
    for (const purchase of purchases) {
      entries.push({
        sort_date: purchase.date,
        sort_created: sortKey('0', purchase.id),
        date: purchase.date,
        description: `Bill ${purchase.invoice_no}`,
        debit: 0,
        credit: purchase.total_amount,
        reference_type: 'purchase',
        reference_id: purchase.id,
      });
    }

    const payments = await db.getAllAsync<{
      purchase_id: number;
      amount: number;
      date: string;
      payment_id: number;
      invoice_no: string;
    }>(
      `SELECT pp.purchase_id, pp.amount, pp.date, pp.id as payment_id, p.invoice_no
       FROM purchase_payments pp
       JOIN purchases p ON p.id = pp.purchase_id
       WHERE p.supplier_name = ? COLLATE NOCASE`,
      [party.name]
    );
    for (const payment of payments) {
      entries.push({
        sort_date: payment.date,
        sort_created: sortKey('1', payment.payment_id),
        date: payment.date,
        description: `Payment — ${payment.invoice_no}`,
        debit: payment.amount,
        credit: 0,
        reference_type: 'payment',
        reference_id: payment.purchase_id,
      });
    }
  }

  entries.sort((a, b) => {
    const byDate = a.sort_date.localeCompare(b.sort_date);
    if (byDate !== 0) return byDate;
    return a.sort_created.localeCompare(b.sort_created);
  });

  let balance = 0;
  return entries.map((entry, index) => {
    if (party.type === 'customer') {
      balance = roundMoney(balance + entry.debit - entry.credit);
    } else {
      balance = roundMoney(balance + entry.credit - entry.debit);
    }
    return {
      id: `${entry.reference_type}-${entry.reference_id}-${index}`,
      date: entry.date,
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      balance,
      reference_type: entry.reference_type,
      reference_id: entry.reference_id,
    };
  });
}

export async function getPartyHistory(partyId: number): Promise<PartyHistoryItem[]> {
  const party = await getPartyById(partyId);
  if (!party) return [];

  const db = await getDatabase();
  if (party.type === 'customer') {
    return db.getAllAsync<PartyHistoryItem>(
      `SELECT id, invoice_no, date, total_amount, paid_amount, status, 'sale' as record_type
       FROM sales WHERE party_name = ? COLLATE NOCASE
       ORDER BY date DESC, id DESC`,
      [party.name]
    );
  }

  return db.getAllAsync<PartyHistoryItem>(
    `SELECT id, invoice_no, date, total_amount, paid_amount, status, 'purchase' as record_type
     FROM purchases WHERE supplier_name = ? COLLATE NOCASE
     ORDER BY date DESC, id DESC`,
    [party.name]
  );
}

export async function getPartyById(id: number): Promise<Party | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Party>('SELECT * FROM parties WHERE id = ?', [id]);
}

export async function getPartyByName(name: string, type: PartyType): Promise<Party | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const db = await getDatabase();
  return db.getFirstAsync<Party>(
    'SELECT * FROM parties WHERE name = ? COLLATE NOCASE AND type = ?',
    [trimmed, type]
  );
}

export async function searchPartyNames(query: string, type: PartyType): Promise<string[]> {
  const db = await getDatabase();
  const q = query.trim();
  const txColumn = type === 'customer' ? 'party_name' : 'supplier_name';
  const txTable = type === 'customer' ? 'sales' : 'purchases';

  if (!q) {
    return db
      .getAllAsync<{ name: string }>(
        `SELECT MIN(name) as name FROM (
           SELECT name FROM parties WHERE type = ?
           UNION
           SELECT ${txColumn} AS name FROM ${txTable}
           WHERE ${txColumn} IS NOT NULL AND ${txColumn} != ''
         )
         GROUP BY name COLLATE NOCASE
         ORDER BY name ASC LIMIT 20`,
        [type]
      )
      .then((rows) => rows.map((r) => r.name));
  }

  return db
    .getAllAsync<{ name: string }>(
      `SELECT MIN(name) as name FROM (
         SELECT name FROM parties WHERE type = ?
         UNION
         SELECT ${txColumn} AS name FROM ${txTable}
         WHERE ${txColumn} IS NOT NULL AND ${txColumn} != ''
       )
       WHERE name LIKE ? COLLATE NOCASE
       GROUP BY name COLLATE NOCASE
       ORDER BY name ASC LIMIT 20`,
      [type, `%${q}%`]
    )
    .then((rows) => rows.map((r) => r.name));
}

export async function upsertParty(
  name: string,
  type: PartyType,
  dbHandle?: SQLite.SQLiteDatabase,
  phone?: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const db = dbHandle ?? (await getDatabase());
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM parties WHERE name = ? COLLATE NOCASE AND type = ?',
    [trimmed, type]
  );
  const phoneValue = phone?.trim() || null;
  if (existing) {
    if (phoneValue) {
      await db.runAsync('UPDATE parties SET phone = ? WHERE id = ?', [phoneValue, existing.id]);
    }
    return;
  }

  await db.runAsync('INSERT INTO parties (name, type, phone) VALUES (?, ?, ?)', [
    trimmed,
    type,
    phoneValue,
  ]);
}

export async function syncPartiesFromTransactions(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`
      INSERT OR IGNORE INTO parties (name, type)
      SELECT DISTINCT party_name, 'customer' FROM sales
      WHERE party_name IS NOT NULL AND party_name != ''
    `);
    await db.runAsync(`
      INSERT OR IGNORE INTO parties (name, type)
      SELECT DISTINCT supplier_name, 'vendor' FROM purchases
      WHERE supplier_name IS NOT NULL AND supplier_name != ''
    `);
  });
}

export async function createParty(params: {
  name: string;
  type: PartyType;
  phone?: string;
  notes?: string;
}): Promise<number> {
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error('Name is required');

  const db = await getDatabase();
  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM parties WHERE name = ? COLLATE NOCASE AND type = ?',
    [trimmed, params.type]
  );
  if (duplicate) {
    throw new Error(
      `A ${params.type === 'customer' ? 'customer' : 'vendor'} named "${trimmed}" already exists`
    );
  }

  const result = await db.runAsync(
    'INSERT INTO parties (name, type, phone, notes) VALUES (?, ?, ?, ?)',
    [trimmed, params.type, params.phone?.trim() || null, params.notes?.trim() || null]
  );
  if (result.lastInsertRowId) {
    return result.lastInsertRowId;
  }
  const created = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM parties WHERE name = ? AND type = ?',
    [trimmed, params.type]
  );
  return created?.id ?? 0;
}

export async function updateParty(
  id: number,
  params: { name: string; type: PartyType; phone?: string; notes?: string }
): Promise<void> {
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error('Name is required');

  const existing = await getPartyById(id);
  if (!existing) throw new Error('Party not found');

  const db = await getDatabase();

  if (params.type !== existing.type) {
    const table = existing.type === 'customer' ? 'sales' : 'purchases';
    const column = existing.type === 'customer' ? 'party_name' : 'supplier_name';
    const used = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${table} WHERE ${column} = ? COLLATE NOCASE`,
      [existing.name]
    );
    if (used && used.count > 0) {
      throw new Error(
        `Cannot change type: this ${existing.type} has existing ${existing.type === 'customer' ? 'sales' : 'purchase'} records`
      );
    }
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE parties SET name = ?, type = ?, phone = ?, notes = ? WHERE id = ?', [
      trimmed,
      params.type,
      params.phone?.trim() || null,
      params.notes?.trim() || null,
      id,
    ]);

    if (trimmed.toLowerCase() !== existing.name.toLowerCase()) {
      if (params.type === 'customer') {
        await db.runAsync(
          `UPDATE transactions SET description = (
             SELECT 'Payment for ' || s.invoice_no || ' - ' || ? FROM sales s WHERE s.id = transactions.reference_id
           )
           WHERE reference_type = 'sale'
           AND reference_id IN (SELECT id FROM sales WHERE party_name = ? COLLATE NOCASE)`,
          [trimmed, existing.name]
        );
        await db.runAsync(
          'UPDATE sales SET party_name = ? WHERE party_name = ? COLLATE NOCASE',
          [trimmed, existing.name]
        );
      }
      if (params.type === 'vendor') {
        await db.runAsync(
          `UPDATE transactions SET description = (
             SELECT 'Payment for ' || p.invoice_no || ' - ' || ? FROM purchases p WHERE p.id = transactions.reference_id
           )
           WHERE reference_type = 'purchase'
           AND reference_id IN (SELECT id FROM purchases WHERE supplier_name = ? COLLATE NOCASE)`,
          [trimmed, existing.name]
        );
        await db.runAsync(
          'UPDATE purchases SET supplier_name = ? WHERE supplier_name = ? COLLATE NOCASE',
          [trimmed, existing.name]
        );
      }
    }
  });
}

export async function deleteParty(id: number): Promise<void> {
  const party = await getPartyById(id);
  if (!party) throw new Error('Party not found');

  const db = await getDatabase();
  if (party.type === 'customer') {
    const used = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sales WHERE party_name = ? COLLATE NOCASE',
      [party.name]
    );
    if (used && used.count > 0) {
      throw new Error('Cannot delete: this customer has sales records');
    }
  } else {
    const used = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM purchases WHERE supplier_name = ? COLLATE NOCASE',
      [party.name]
    );
    if (used && used.count > 0) {
      throw new Error('Cannot delete: this vendor has purchase records');
    }
  }

  await db.runAsync('DELETE FROM parties WHERE id = ?', [id]);
}

import { getDatabase, recordTransaction, updateAccountBalance } from '../db/database';
import { resolvePeriodRange } from '../utils/period';
import { roundMoney } from '../utils/money';
import { getAccountById, getAccountsForPicker } from './banking';
import type { OtherIncome, Transaction } from '../types';

const ACTIVE_ACCOUNT_SQL = 'COALESCE(a.is_excluded, 0) = 0';

async function ensureOtherIncomeCategory(
  db: Awaited<ReturnType<typeof getDatabase>>,
  category: string
): Promise<string> {
  const trimmed = category.trim();
  if (!trimmed) throw new Error('Category is required');
  await db.runAsync('INSERT OR IGNORE INTO other_income_categories (name) VALUES (?)', [trimmed]);
  return trimmed;
}

async function assertActiveAccount(accountId: number): Promise<void> {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('Account not found');
  if (account.is_excluded) throw new Error('Cannot use an excluded account');
}

async function syncGeneralLedgerAfterWrite(): Promise<void> {
  const { refreshGeneralLedgerAfterWrite } = await import('./ledger');
  await refreshGeneralLedgerAfterWrite();
}

export async function getOtherIncomeCategories(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM other_income_categories ORDER BY name COLLATE NOCASE ASC`
  );
  return rows.map((r) => r.name);
}

export async function addOtherIncomeCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');

  const db = await getDatabase();
  await db.runAsync('INSERT OR IGNORE INTO other_income_categories (name) VALUES (?)', [trimmed]);
}

export async function deleteOtherIncomeCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');

  const db = await getDatabase();
  await db.runAsync('DELETE FROM other_income_categories WHERE name = ? COLLATE NOCASE', [trimmed]);
}

export async function getOtherIncome(periodKey?: string): Promise<OtherIncome[]> {
  const db = await getDatabase();
  if (periodKey) {
    const { start, end } = await resolvePeriodRange(periodKey);
    return db.getAllAsync<OtherIncome>(
      `SELECT oi.*, a.name as account_name FROM other_income oi
       JOIN accounts a ON a.id = oi.account_id
       WHERE oi.date >= ? AND oi.date <= ?
       ORDER BY oi.date DESC, oi.id DESC`,
      [start, end]
    );
  }
  return db.getAllAsync<OtherIncome>(
    `SELECT oi.*, a.name as account_name FROM other_income oi
     JOIN accounts a ON a.id = oi.account_id
     ORDER BY oi.date DESC, oi.id DESC`
  );
}

export async function getOtherIncomeById(id: number): Promise<OtherIncome | null> {
  const db = await getDatabase();
  return db.getFirstAsync<OtherIncome>(
    `SELECT oi.*, a.name as account_name FROM other_income oi
     JOIN accounts a ON a.id = oi.account_id
     WHERE oi.id = ?`,
    [id]
  );
}

export async function getOtherIncomeTotalForRange(start: string, end: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(oi.amount), 0) as total
     FROM other_income oi
     JOIN accounts a ON a.id = oi.account_id
     WHERE oi.date >= ? AND oi.date <= ?
     AND ${ACTIVE_ACCOUNT_SQL}`,
    [start, end]
  );
  return roundMoney(row?.total ?? 0);
}

export async function createOtherIncome(params: {
  category: string;
  description: string;
  amount: number;
  account_id: number;
  date: string;
}): Promise<number> {
  if (!params.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }
  await assertActiveAccount(params.account_id);

  const amount = roundMoney(params.amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');

  const db = await getDatabase();
  let incomeId = 0;

  await db.withTransactionAsync(async () => {
    const category = await ensureOtherIncomeCategory(db, params.category);
    const result = await db.runAsync(
      `INSERT INTO other_income (category, description, amount, account_id, date)
       VALUES (?, ?, ?, ?, ?)`,
      [category, params.description.trim(), amount, params.account_id, params.date]
    );
    incomeId = result.lastInsertRowId;
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'other_income',
      amount,
      reference_type: 'other_income',
      reference_id: incomeId,
      description: `${category}: ${params.description.trim()}`,
      date: params.date,
    });
  });

  await syncGeneralLedgerAfterWrite();
  return incomeId;
}

export async function updateOtherIncome(
  id: number,
  params: {
    category: string;
    description: string;
    amount: number;
    account_id: number;
    date: string;
  }
): Promise<void> {
  if (!params.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }
  await assertActiveAccount(params.account_id);

  const amount = roundMoney(params.amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');

  const db = await getDatabase();
  const existing = await getOtherIncomeById(id);
  if (!existing) throw new Error('Other income not found');

  await db.withTransactionAsync(async () => {
    const category = await ensureOtherIncomeCategory(db, params.category);
    const tx = await db.getFirstAsync<Transaction>(
      `SELECT * FROM transactions WHERE reference_type = 'other_income' AND reference_id = ? LIMIT 1`,
      [id]
    );
    if (tx) {
      await updateAccountBalance(db, tx.account_id, -tx.amount);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
    }

    await db.runAsync(
      `UPDATE other_income SET category = ?, description = ?, amount = ?, account_id = ?, date = ? WHERE id = ?`,
      [
        category,
        params.description.trim(),
        amount,
        params.account_id,
        params.date,
        id,
      ]
    );

    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'other_income',
      amount,
      reference_type: 'other_income',
      reference_id: id,
      description: `${category}: ${params.description.trim()}`,
      date: params.date,
    });
  });

  await syncGeneralLedgerAfterWrite();
}

export async function deleteOtherIncome(id: number): Promise<void> {
  const db = await getDatabase();
  const tx = await db.getFirstAsync<Transaction>(
    `SELECT * FROM transactions WHERE reference_type = 'other_income' AND reference_id = ? LIMIT 1`,
    [id]
  );

  await db.withTransactionAsync(async () => {
    if (tx) {
      await updateAccountBalance(db, tx.account_id, -tx.amount);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
    }
    await db.runAsync('DELETE FROM other_income WHERE id = ?', [id]);
  });

  await syncGeneralLedgerAfterWrite();
}

export { getAccountsForPicker };

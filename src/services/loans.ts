import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';
import type { Loan } from '../types';

async function syncGeneralLedgerAfterWrite(): Promise<void> {
  const { refreshGeneralLedgerAfterWrite } = await import('./ledger');
  await refreshGeneralLedgerAfterWrite();
}

function normalizeRate(value?: number): number | null {
  if (value === undefined || value === null || !Number.isFinite(value) || value < 0) return null;
  return roundMoney(value);
}

function normalizeDate(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeNotes(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getLoans(): Promise<Loan[]> {
  const db = await getDatabase();
  return db.getAllAsync<Loan>(
    'SELECT * FROM loans ORDER BY outstanding_amount DESC, lender_name COLLATE NOCASE ASC'
  );
}

export async function addLoan(params: {
  lender_name: string;
  principal_amount: number;
  outstanding_amount: number;
  interest_rate?: number;
  start_date?: string;
  notes?: string;
}): Promise<number> {
  const lender = params.lender_name.trim();
  if (!lender) throw new Error('Lender name is required');
  if (!Number.isFinite(params.principal_amount) || params.principal_amount <= 0) {
    throw new Error('Principal amount must be greater than zero');
  }
  if (!Number.isFinite(params.outstanding_amount) || params.outstanding_amount < 0) {
    throw new Error('Outstanding amount cannot be negative');
  }
  if (params.outstanding_amount > params.principal_amount + 0.01) {
    throw new Error('Outstanding amount cannot exceed principal amount');
  }

  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO loans (
      lender_name, principal_amount, outstanding_amount, interest_rate, start_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      lender,
      roundMoney(params.principal_amount),
      roundMoney(params.outstanding_amount),
      normalizeRate(params.interest_rate),
      normalizeDate(params.start_date),
      normalizeNotes(params.notes),
    ]
  );
  await syncGeneralLedgerAfterWrite();
  return result.lastInsertRowId;
}

export async function updateLoan(
  id: number,
  params: {
    lender_name: string;
    principal_amount: number;
    outstanding_amount: number;
    interest_rate?: number;
    start_date?: string;
    notes?: string;
  }
): Promise<void> {
  const lender = params.lender_name.trim();
  if (!lender) throw new Error('Lender name is required');
  if (!Number.isFinite(params.principal_amount) || params.principal_amount <= 0) {
    throw new Error('Principal amount must be greater than zero');
  }
  if (!Number.isFinite(params.outstanding_amount) || params.outstanding_amount < 0) {
    throw new Error('Outstanding amount cannot be negative');
  }
  if (params.outstanding_amount > params.principal_amount + 0.01) {
    throw new Error('Outstanding amount cannot exceed principal amount');
  }

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE loans
     SET lender_name = ?, principal_amount = ?, outstanding_amount = ?, interest_rate = ?, start_date = ?, notes = ?
     WHERE id = ?`,
    [
      lender,
      roundMoney(params.principal_amount),
      roundMoney(params.outstanding_amount),
      normalizeRate(params.interest_rate),
      normalizeDate(params.start_date),
      normalizeNotes(params.notes),
      id,
    ]
  );
  await syncGeneralLedgerAfterWrite();
}

export async function deleteLoan(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM loans WHERE id = ?', [id]);
  await syncGeneralLedgerAfterWrite();
}

import { getDatabase, recordTransaction } from '../db/database';
import { roundMoney, addMoney, subMoney } from '../utils/money';
import type { Loan, LoanDirection, LoanMovement } from '../types';

async function syncGeneralLedgerAfterWrite(): Promise<void> {
  const { refreshGeneralLedgerAfterWrite } = await import('./ledger');
  await refreshGeneralLedgerAfterWrite();
}

function normalizeRate(value?: number): number | null {
  if (value === undefined || value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function normalizeDate(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeNotes(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function insertMovement(
  db: Awaited<ReturnType<typeof getDatabase>>,
  params: {
    loan_id: number;
    kind: string;
    amount: number;
    account_id?: number | null;
    reference_type?: string | null;
    reference_id?: number | null;
    date: string;
    notes?: string | null;
  }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO loan_movements (
       loan_id, kind, amount, account_id, reference_type, reference_id, date, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.loan_id,
      params.kind,
      roundMoney(params.amount),
      params.account_id ?? null,
      params.reference_type ?? null,
      params.reference_id ?? null,
      params.date,
      params.notes ?? null,
    ]
  );
}

export async function getLoans(options?: { direction?: LoanDirection }): Promise<Loan[]> {
  const db = await getDatabase();
  if (options?.direction) {
    return db.getAllAsync<Loan>(
      `SELECT * FROM loans WHERE direction = ?
       ORDER BY outstanding_amount DESC, lender_name COLLATE NOCASE ASC`,
      [options.direction]
    );
  }
  return db.getAllAsync<Loan>(
    `SELECT * FROM loans
     ORDER BY outstanding_amount DESC, lender_name COLLATE NOCASE ASC`
  );
}

export async function getLoanById(id: number): Promise<Loan | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Loan>('SELECT * FROM loans WHERE id = ?', [id]);
}

export async function getOpenBorrowedLoans(): Promise<Loan[]> {
  const db = await getDatabase();
  return db.getAllAsync<Loan>(
    `SELECT * FROM loans
     WHERE direction = 'borrowed' AND outstanding_amount > 0
     ORDER BY lender_name COLLATE NOCASE ASC`
  );
}

export async function getLoanMovements(loanId: number): Promise<LoanMovement[]> {
  const db = await getDatabase();
  return db.getAllAsync<LoanMovement>(
    `SELECT * FROM loan_movements WHERE loan_id = ? ORDER BY date DESC, id DESC`,
    [loanId]
  );
}

/** Memo borrowed IOU — cash unchanged. */
export async function borrowMoney(params: {
  lender_name: string;
  principal_amount: number;
  outstanding_amount?: number;
  interest_rate?: number;
  start_date?: string;
  notes?: string;
}): Promise<number> {
  return addLoan({
    ...params,
    direction: 'borrowed',
    outstanding_amount: params.outstanding_amount ?? params.principal_amount,
  });
}

/** Lend cash — cash out + receivable outstanding. */
export async function lendMoney(params: {
  lender_name: string;
  principal_amount: number;
  account_id: number;
  interest_rate?: number;
  start_date?: string;
  notes?: string;
}): Promise<number> {
  const name = params.lender_name.trim();
  if (!name) throw new Error('Borrower name is required');
  if (!Number.isFinite(params.principal_amount) || params.principal_amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  if (!params.account_id) throw new Error('Select a cash/bank account');

  const amount = roundMoney(params.principal_amount);
  const date = normalizeDate(params.start_date) || new Date().toISOString().slice(0, 10);
  const db = await getDatabase();
  let loanId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO loans (
        lender_name, direction, principal_amount, outstanding_amount, interest_rate, start_date, notes
      ) VALUES (?, 'lent', ?, ?, ?, ?, ?)`,
      [
        name,
        amount,
        amount,
        normalizeRate(params.interest_rate),
        date,
        normalizeNotes(params.notes),
      ]
    );
    loanId = result.lastInsertRowId;
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'withdrawal',
      amount: -amount,
      reference_type: 'loan',
      reference_id: loanId,
      description: `Money lent to ${name}`,
      date,
    });
    await insertMovement(db, {
      loan_id: loanId,
      kind: 'open',
      amount,
      account_id: params.account_id,
      date,
      notes: 'Lent',
    });
  });

  await syncGeneralLedgerAfterWrite();
  return loanId;
}

export async function addLoan(params: {
  lender_name: string;
  direction?: LoanDirection;
  principal_amount: number;
  outstanding_amount: number;
  interest_rate?: number;
  start_date?: string;
  notes?: string;
}): Promise<number> {
  const lender = params.lender_name.trim();
  const direction = params.direction ?? 'borrowed';
  if (!lender) throw new Error(direction === 'lent' ? 'Borrower name is required' : 'Lender name is required');
  if (direction !== 'borrowed' && direction !== 'lent') {
    throw new Error('Invalid loan direction');
  }
  if (!Number.isFinite(params.principal_amount) || params.principal_amount <= 0) {
    throw new Error('Principal amount must be greater than zero');
  }
  if (!Number.isFinite(params.outstanding_amount) || params.outstanding_amount < 0) {
    throw new Error('Outstanding amount cannot be negative');
  }
  if (params.outstanding_amount > params.principal_amount + 1) {
    throw new Error('Outstanding amount cannot exceed principal amount');
  }

  const db = await getDatabase();
  const date = normalizeDate(params.start_date) || new Date().toISOString().slice(0, 10);
  const result = await db.runAsync(
    `INSERT INTO loans (
      lender_name, direction, principal_amount, outstanding_amount, interest_rate, start_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      lender,
      direction,
      roundMoney(params.principal_amount),
      roundMoney(params.outstanding_amount),
      normalizeRate(params.interest_rate),
      date,
      normalizeNotes(params.notes),
    ]
  );
  const loanId = result.lastInsertRowId;
  await insertMovement(db, {
    loan_id: loanId,
    kind: 'open',
    amount: roundMoney(params.outstanding_amount),
    date,
    notes: direction === 'lent' ? 'Lent' : 'Borrowed',
  });
  await syncGeneralLedgerAfterWrite();
  return loanId;
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
  if (!lender) throw new Error('Name is required');
  if (!Number.isFinite(params.principal_amount) || params.principal_amount <= 0) {
    throw new Error('Principal amount must be greater than zero');
  }
  if (!Number.isFinite(params.outstanding_amount) || params.outstanding_amount < 0) {
    throw new Error('Outstanding amount cannot be negative');
  }
  if (params.outstanding_amount > params.principal_amount + 1) {
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

/** Increase borrowed outstanding (expense / fixed asset funded by borrow). */
export async function increaseBorrowedOutstanding(
  db: Awaited<ReturnType<typeof getDatabase>>,
  loanId: number,
  amount: number,
  kind: 'expense' | 'fixed_asset',
  date: string,
  reference?: { type: string; id: number }
): Promise<void> {
  const loan = await db.getFirstAsync<Loan>('SELECT * FROM loans WHERE id = ?', [loanId]);
  if (!loan) throw new Error('Loan not found');
  if (loan.direction !== 'borrowed') throw new Error('Select a borrowed loan');
  const bump = roundMoney(amount);
  if (bump <= 0) throw new Error('Amount must be greater than zero');
  const nextOut = addMoney(loan.outstanding_amount, bump);
  const nextPrincipal =
    nextOut > loan.principal_amount ? nextOut : loan.principal_amount;
  await db.runAsync(
    `UPDATE loans SET outstanding_amount = ?, principal_amount = ? WHERE id = ?`,
    [nextOut, nextPrincipal, loanId]
  );
  await insertMovement(db, {
    loan_id: loanId,
    kind,
    amount: bump,
    reference_type: reference?.type ?? null,
    reference_id: reference?.id ?? null,
    date,
  });
}

/** Reverse a prior borrow-funded bump (on delete). */
export async function decreaseBorrowedOutstanding(
  db: Awaited<ReturnType<typeof getDatabase>>,
  loanId: number,
  amount: number,
  date: string,
  notes?: string
): Promise<void> {
  const loan = await db.getFirstAsync<Loan>('SELECT * FROM loans WHERE id = ?', [loanId]);
  if (!loan || loan.direction !== 'borrowed') return;
  const cut = roundMoney(Math.min(amount, loan.outstanding_amount));
  if (cut <= 0) return;
  await db.runAsync(`UPDATE loans SET outstanding_amount = ? WHERE id = ?`, [
    subMoney(loan.outstanding_amount, cut),
    loanId,
  ]);
  await insertMovement(db, {
    loan_id: loanId,
    kind: 'adjust',
    amount: -cut,
    date,
    notes: notes ?? 'Reversal',
  });
}

export async function repayBorrow(params: {
  loanId: number;
  account_id: number;
  amount: number;
  date: string;
  notes?: string;
}): Promise<void> {
  const amount = roundMoney(params.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero');
  if (!params.account_id) throw new Error('Select a cash/bank account');

  const db = await getDatabase();
  const loan = await getLoanById(params.loanId);
  if (!loan) throw new Error('Loan not found');
  if (loan.direction !== 'borrowed') throw new Error('Not a borrowed loan');
  if (amount > loan.outstanding_amount + 1) {
    throw new Error('Amount cannot exceed outstanding balance');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE loans SET outstanding_amount = ? WHERE id = ?`, [
      subMoney(loan.outstanding_amount, amount),
      loan.id,
    ]);
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'withdrawal',
      amount: -amount,
      reference_type: 'loan',
      reference_id: loan.id,
      description: `Loan repayment — ${loan.lender_name}`,
      date: params.date,
    });
    await insertMovement(db, {
      loan_id: loan.id,
      kind: 'repay',
      amount,
      account_id: params.account_id,
      date: params.date,
      notes: params.notes ?? null,
    });
  });

  await syncGeneralLedgerAfterWrite();
}

export async function collectLent(params: {
  loanId: number;
  account_id: number;
  amount: number;
  date: string;
  notes?: string;
}): Promise<void> {
  const amount = roundMoney(params.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero');
  if (!params.account_id) throw new Error('Select a cash/bank account');

  const db = await getDatabase();
  const loan = await getLoanById(params.loanId);
  if (!loan) throw new Error('Loan not found');
  if (loan.direction !== 'lent') throw new Error('Not a money-lent entry');
  if (amount > loan.outstanding_amount + 1) {
    throw new Error('Amount cannot exceed outstanding balance');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE loans SET outstanding_amount = ? WHERE id = ?`, [
      subMoney(loan.outstanding_amount, amount),
      loan.id,
    ]);
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'deposit',
      amount,
      reference_type: 'loan',
      reference_id: loan.id,
      description: `Collected from ${loan.lender_name}`,
      date: params.date,
    });
    await insertMovement(db, {
      loan_id: loan.id,
      kind: 'collect',
      amount,
      account_id: params.account_id,
      date: params.date,
      notes: params.notes ?? null,
    });
  });

  await syncGeneralLedgerAfterWrite();
}

export async function deleteLoan(id: number): Promise<void> {
  const db = await getDatabase();
  const loan = await getLoanById(id);
  if (!loan) return;

  const linkedExpense = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM expenses WHERE loan_id = ? LIMIT 1',
    [id]
  );
  if (linkedExpense) {
    throw new Error('Cannot delete: loan is linked to expenses');
  }

  const linkedAsset = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM fixed_assets WHERE loan_id = ? LIMIT 1',
    [id]
  );
  if (linkedAsset) {
    throw new Error('Cannot delete: loan is linked to fixed assets');
  }

  // Reverse cash from lend open if still fully outstanding (simple path).
  if (loan.direction === 'lent') {
    const openMove = await db.getFirstAsync<{ account_id: number | null; amount: number; date: string }>(
      `SELECT account_id, amount, date FROM loan_movements
       WHERE loan_id = ? AND kind = 'open' AND account_id IS NOT NULL
       ORDER BY id ASC LIMIT 1`,
      [id]
    );
    if (
      openMove?.account_id &&
      Math.abs(loan.outstanding_amount - loan.principal_amount) <= 1
    ) {
      await db.withTransactionAsync(async () => {
        await recordTransaction(db, {
          account_id: openMove.account_id!,
          type: 'deposit',
          amount: loan.principal_amount,
          reference_type: 'loan',
          reference_id: id,
          description: `Reversed lend — ${loan.lender_name}`,
          date: openMove.date,
        });
        await db.runAsync('DELETE FROM loan_movements WHERE loan_id = ?', [id]);
        await db.runAsync('DELETE FROM loans WHERE id = ?', [id]);
      });
      await syncGeneralLedgerAfterWrite();
      return;
    }
  }

  await db.runAsync('DELETE FROM loan_movements WHERE loan_id = ?', [id]);
  await db.runAsync('DELETE FROM loans WHERE id = ?', [id]);
  await syncGeneralLedgerAfterWrite();
}

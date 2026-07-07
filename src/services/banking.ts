import AsyncStorage from '@react-native-async-storage/async-storage';
import { addMonths, addWeeks, addYears, format, parse } from 'date-fns';
import {
  getDatabase,
  getPaymentStatus,
  recordTransaction,
  updateAccountBalance,
} from '../db/database';
import { todayISO } from '../utils/date';
import { resolvePeriodRange } from '../utils/period';
import { addMoney, roundMoney, subMoney } from '../utils/money';
import { getPurchaseById } from './purchases';
import { getSaleById } from './sales';
import type { Account, BalanceSheet, Expense, FixedAsset, Transaction } from '../types';

const ACTIVE_ACCOUNT_SQL = 'COALESCE(is_excluded, 0) = 0';

/** Validate and normalize a user-entered money amount. */
function assertPositiveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter an amount greater than zero');
  }
  return roundMoney(amount);
}

async function assertActiveAccount(accountId: number, usage: string): Promise<void> {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('Account not found');
  if (account.is_excluded) {
    throw new Error(`Cannot use an excluded account for ${usage}`);
  }
}

export async function getAccounts(): Promise<Account[]> {
  const db = await getDatabase();
  return db.getAllAsync<Account>('SELECT * FROM accounts ORDER BY name ASC');
}

/** Accounts available for payments, expenses, transfers, and totals. */
export async function getSelectableAccounts(): Promise<Account[]> {
  const db = await getDatabase();
  return db.getAllAsync<Account>(
    `SELECT * FROM accounts WHERE ${ACTIVE_ACCOUNT_SQL} ORDER BY name ASC`
  );
}

/** Accounts for new outflows: deactivated accounts are hidden from new pickers. */
export async function getPaymentAccounts(): Promise<Account[]> {
  return getSelectableAccounts();
}

/** Selectable accounts plus one existing account (for edit screens). */
export async function getAccountsForPicker(
  includeAccountId?: number,
  options?: { includeExcluded?: boolean }
): Promise<Account[]> {
  const accounts = options?.includeExcluded
    ? await getPaymentAccounts()
    : await getSelectableAccounts();
  if (!includeAccountId || accounts.some((a) => a.id === includeAccountId)) {
    return accounts;
  }
  const extra = await getAccountById(includeAccountId);
  if (!extra) return accounts;
  return [...accounts, extra].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAccountById(id: number): Promise<Account | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Account>('SELECT * FROM accounts WHERE id = ?', [id]);
}

export async function createAccount(params: {
  name: string;
  type: 'cash' | 'bank';
  opening_balance?: number;
}): Promise<number> {
  const db = await getDatabase();
  const opening = roundMoney(params.opening_balance ?? 0);

  let accountId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO accounts (name, type, opening_balance, current_balance, is_excluded) VALUES (?, ?, ?, ?, 0)`,
      [params.name, params.type, opening, 0]
    );

    accountId = result.lastInsertRowId;

    if (opening !== 0) {
      await recordTransaction(db, {
        account_id: accountId,
        type: 'opening',
        amount: opening,
        description: `Opening balance - ${params.name}`,
        date: todayISO(),
      });
    }
  });

  return accountId;
}

/**
 * Change an account's opening balance by rewriting its 'opening' ledger row
 * and shifting the current balance by the difference, atomically.
 */
export async function updateOpeningBalance(accountId: number, newOpening: number): Promise<void> {
  if (!Number.isFinite(newOpening)) {
    throw new Error('Enter a valid opening balance');
  }
  const account = await getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  const opening = roundMoney(newOpening);
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    const tx = await db.getFirstAsync<Transaction>(
      `SELECT * FROM transactions WHERE account_id = ? AND type = 'opening' LIMIT 1`,
      [accountId]
    );
    const oldAmount = roundMoney(tx?.amount ?? 0);
    const delta = subMoney(opening, oldAmount);

    if (tx) {
      if (opening === 0) {
        await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
      } else {
        await db.runAsync('UPDATE transactions SET amount = ? WHERE id = ?', [opening, tx.id]);
      }
    } else if (opening !== 0) {
      await db.runAsync(
        `INSERT INTO transactions (account_id, type, amount, description, date) VALUES (?, 'opening', ?, ?, ?)`,
        [accountId, opening, `Opening balance - ${account.name}`, todayISO()]
      );
    }

    await db.runAsync(
      'UPDATE accounts SET opening_balance = ?, current_balance = ROUND(current_balance + ?, 2) WHERE id = ?',
      [opening, delta, accountId]
    );
  });
}

export async function updateAccount(
  id: number,
  params: {
    name: string;
    type: 'cash' | 'bank';
    is_excluded?: boolean;
  }
): Promise<void> {
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error('Account name is required');

  const existing = await getAccountById(id);
  if (!existing) throw new Error('Account not found');

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE accounts SET name = ?, type = ?, is_excluded = ? WHERE id = ?`,
    [trimmed, params.type, params.is_excluded ? 1 : 0, id]
  );
}

export async function deleteAccount(id: number): Promise<void> {
  const account = await getAccountById(id);
  if (!account) throw new Error('Account not found');

  const db = await getDatabase();

  const tx = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM transactions WHERE account_id = ? LIMIT 1',
    [id]
  );
  if (tx) throw new Error('Cannot delete: account has transaction history');

  const expense = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM expenses WHERE account_id = ? LIMIT 1',
    [id]
  );
  if (expense) throw new Error('Cannot delete: account is used in expenses');

  const income = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM other_income WHERE account_id = ? LIMIT 1',
    [id]
  );
  if (income) throw new Error('Cannot delete: account is used in other income');

  const salePay = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM sale_payments WHERE account_id = ? LIMIT 1',
    [id]
  );
  if (salePay) throw new Error('Cannot delete: account is used in sale payments');

  const purchasePay = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM purchase_payments WHERE account_id = ? LIMIT 1',
    [id]
  );
  if (purchasePay) throw new Error('Cannot delete: account is used in purchase payments');

  await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
}

export async function getTransactions(accountId?: number): Promise<Transaction[]> {
  const db = await getDatabase();
  if (accountId) {
    return db.getAllAsync<Transaction>(
      `SELECT t.*, a.name as account_name FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE t.account_id = ?
       ORDER BY t.date DESC, t.id DESC`,
      [accountId]
    );
  }
  return db.getAllAsync<Transaction>(
    `SELECT t.*, a.name as account_name FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     ORDER BY t.date DESC, t.id DESC`
  );
}

export async function getTotalBalance(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE ${ACTIVE_ACCOUNT_SQL}`
  );
  return row?.total ?? 0;
}

export async function getExpenseCategories(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM expense_categories ORDER BY name COLLATE NOCASE ASC`
  );
  return rows.map((r) => r.name);
}

export async function addExpenseCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');

  const db = await getDatabase();
  await db.runAsync('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)', [trimmed]);
}

export async function deleteExpenseCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');

  const db = await getDatabase();
  await db.runAsync('DELETE FROM expense_categories WHERE name = ? COLLATE NOCASE', [trimmed]);
}

async function ensureExpenseCategory(
  db: Awaited<ReturnType<typeof getDatabase>>,
  category: string
): Promise<string> {
  const trimmed = category.trim();
  if (!trimmed) throw new Error('Category is required');
  await db.runAsync('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)', [trimmed]);
  return trimmed;
}

export async function createExpense(params: {
  category: string;
  description: string;
  amount: number;
  account_id: number;
  date: string;
  is_recurring?: boolean;
  recurrence?: string;
}): Promise<number> {
  if (!params.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }
  const amount = assertPositiveAmount(params.amount);
  await assertActiveAccount(params.account_id, 'expenses');

  const db = await getDatabase();

  let expenseId = 0;
  await db.withTransactionAsync(async () => {
    const category = await ensureExpenseCategory(db, params.category);
    const result = await db.runAsync(
      `INSERT INTO expenses (category, description, amount, account_id, date, is_recurring, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        category,
        params.description,
        amount,
        params.account_id,
        params.date,
        params.is_recurring ? 1 : 0,
        params.recurrence ?? null,
      ]
    );
    expenseId = result.lastInsertRowId;
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'expense',
      amount: -amount,
      reference_type: 'expense',
      reference_id: expenseId,
      description: `${category}: ${params.description}`,
      date: params.date,
    });
  });

  return expenseId;
}

export async function getExpenses(periodKey?: string): Promise<Expense[]> {
  const db = await getDatabase();
  if (periodKey) {
    const { start, end } = await resolvePeriodRange(periodKey);
    return db.getAllAsync<Expense>(
      `SELECT e.*, a.name as account_name FROM expenses e
       JOIN accounts a ON a.id = e.account_id
       WHERE e.date >= ? AND e.date <= ?
       ORDER BY e.date DESC`,
      [start, end]
    );
  }
  return db.getAllAsync<Expense>(
    `SELECT e.*, a.name as account_name FROM expenses e
     JOIN accounts a ON a.id = e.account_id
     ORDER BY e.date DESC`
  );
}

export async function getExpenseById(id: number): Promise<Expense | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Expense>(
    `SELECT e.*, a.name as account_name FROM expenses e
     JOIN accounts a ON a.id = e.account_id
     WHERE e.id = ?`,
    [id]
  );
}

export async function updateExpense(
  id: number,
  params: {
    category: string;
    description: string;
    amount: number;
    account_id: number;
    date: string;
    is_recurring?: boolean;
    recurrence?: string;
  }
): Promise<void> {
  if (!params.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }
  const amount = assertPositiveAmount(params.amount);
  await assertActiveAccount(params.account_id, 'expenses');

  const db = await getDatabase();
  const existing = await getExpenseById(id);
  if (!existing) throw new Error('Expense not found');

  await db.withTransactionAsync(async () => {
    const category = await ensureExpenseCategory(db, params.category);
    const tx = await db.getFirstAsync<Transaction>(
      `SELECT * FROM transactions WHERE reference_type = 'expense' AND reference_id = ? LIMIT 1`,
      [id]
    );
    if (tx) {
      await updateAccountBalance(db, tx.account_id, -tx.amount);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
    }

    await db.runAsync(
      `UPDATE expenses SET category = ?, description = ?, amount = ?, account_id = ?, date = ?, is_recurring = ?, recurrence = ? WHERE id = ?`,
      [
        category,
        params.description,
        amount,
        params.account_id,
        params.date,
        params.is_recurring ? 1 : 0,
        params.recurrence ?? null,
        id,
      ]
    );

    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'expense',
      amount: -amount,
      reference_type: 'expense',
      reference_id: id,
      description: `${category}: ${params.description}`,
      date: params.date,
    });
  });

}

export async function deleteExpense(id: number): Promise<void> {
  const db = await getDatabase();
  const tx = await db.getFirstAsync<Transaction>(
    `SELECT * FROM transactions WHERE reference_type = 'expense' AND reference_id = ? LIMIT 1`,
    [id]
  );

  await db.withTransactionAsync(async () => {
    if (tx) {
      await updateAccountBalance(db, tx.account_id, -tx.amount);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
    }
    await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  });

}

export async function getBalanceSheet(): Promise<BalanceSheet> {
  const db = await getDatabase();

  const cashBank = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE ${ACTIVE_ACCOUNT_SQL}`
  );

  const inventory = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(current_qty * avg_cost), 0) as total FROM products WHERE COALESCE(is_hidden, 0) = 0'
  );

  const receivables = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
     FROM sales
     WHERE total_amount - paid_amount > 0.01
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = sales.id)`
  );

  const payables = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
     FROM purchases
     WHERE total_amount - paid_amount > 0.01
       AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = purchases.id)`
  );
  const loans = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(outstanding_amount), 0) as total FROM loans`
  );

  const fixedAssets = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(value), 0) as total FROM fixed_assets'
  );

  const cash = roundMoney(cashBank?.total ?? 0);
  const inv = roundMoney(inventory?.total ?? 0);
  const recv = roundMoney(receivables?.total ?? 0);
  const fixed = roundMoney(fixedAssets?.total ?? 0);
  const pay = roundMoney(payables?.total ?? 0);
  const loan = roundMoney(loans?.total ?? 0);
  const totalAssets = addMoney(cash, inv, recv, fixed);
  const totalLiabilities = addMoney(pay, loan);
  const equity = subMoney(totalAssets, totalLiabilities);

  return {
    assets: {
      cashAndBank: cash,
      inventory: inv,
      receivables: recv,
      fixedAssets: fixed,
      total: totalAssets,
    },
    liabilities: {
      payables: pay,
      loans: loan,
      total: totalLiabilities,
    },
    equity,
  };
}

export async function getFixedAssets(): Promise<FixedAsset[]> {
  const db = await getDatabase();
  return db.getAllAsync<FixedAsset>('SELECT * FROM fixed_assets ORDER BY name ASC');
}

export async function addFixedAsset(params: {
  name: string;
  value: number;
  notes?: string;
}): Promise<number> {
  if (!params.name.trim()) throw new Error('Asset name is required');
  if (!Number.isFinite(params.value) || params.value < 0) {
    throw new Error('Asset value cannot be negative');
  }
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO fixed_assets (name, value, notes) VALUES (?, ?, ?)`,
    [params.name.trim(), roundMoney(params.value), params.notes ?? null]
  );
  return result.lastInsertRowId;
}

export async function updateFixedAsset(
  id: number,
  params: { name: string; value: number; notes?: string }
): Promise<void> {
  if (!params.name.trim()) throw new Error('Asset name is required');
  if (!Number.isFinite(params.value) || params.value < 0) {
    throw new Error('Asset value cannot be negative');
  }
  const db = await getDatabase();
  await db.runAsync(`UPDATE fixed_assets SET name = ?, value = ?, notes = ? WHERE id = ?`, [
    params.name.trim(),
    roundMoney(params.value),
    params.notes ?? null,
    id,
  ]);
}

export async function deleteFixedAsset(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM fixed_assets WHERE id = ?', [id]);
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  const tx = await db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!tx) throw new Error('Transaction not found');

  if (tx.type === 'opening') {
    throw new Error('Opening balances cannot be deleted. Edit the account instead.');
  }

  await db.withTransactionAsync(async () => {
    await updateAccountBalance(db, tx.account_id, -tx.amount);

    if (tx.reference_type === 'sale' && tx.reference_id) {
      // Prefer the exact linked payment; fall back to matching for rows
      // created before payment_id existed.
      const payment = tx.payment_id
        ? await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM sale_payments WHERE id = ?',
            [tx.payment_id]
          )
        : await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM sale_payments WHERE sale_id = ? AND account_id = ? AND amount = ? AND date = ? ORDER BY id DESC LIMIT 1`,
            [tx.reference_id, tx.account_id, tx.amount, tx.date]
          );
      if (payment) {
        await db.runAsync('DELETE FROM sale_payments WHERE id = ?', [payment.id]);
      }
      const sumRow = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ?`,
        [tx.reference_id]
      );
      const sale = await getSaleById(tx.reference_id);
      if (sale) {
        const newPaid = roundMoney(sumRow?.total ?? 0);
        const status = getPaymentStatus(sale.total_amount, newPaid);
        await db.runAsync('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?', [
          newPaid,
          status,
          tx.reference_id,
        ]);
      }
    } else if (tx.reference_type === 'purchase' && tx.reference_id) {
      const paidAmount = Math.abs(tx.amount);
      const payment = tx.payment_id
        ? await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM purchase_payments WHERE id = ?',
            [tx.payment_id]
          )
        : await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM purchase_payments WHERE purchase_id = ? AND account_id = ? AND amount = ? AND date = ? ORDER BY id DESC LIMIT 1`,
            [tx.reference_id, tx.account_id, paidAmount, tx.date]
          );
      if (payment) {
        await db.runAsync('DELETE FROM purchase_payments WHERE id = ?', [payment.id]);
      }
      const sumRow = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_payments WHERE purchase_id = ?`,
        [tx.reference_id]
      );
      const purchase = await getPurchaseById(tx.reference_id);
      if (purchase) {
        const newPaid = roundMoney(sumRow?.total ?? 0);
        const status = getPaymentStatus(purchase.total_amount, newPaid);
        await db.runAsync('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?', [
          newPaid,
          status,
          tx.reference_id,
        ]);
      }
    } else if (tx.reference_type === 'expense' && tx.reference_id) {
      // Deleting a recurring template's ledger row would silently stop all
      // future auto-generated expenses — force an explicit delete instead.
      const expense = await db.getFirstAsync<{ is_recurring: number }>(
        'SELECT is_recurring FROM expenses WHERE id = ?',
        [tx.reference_id]
      );
      if (expense?.is_recurring) {
        throw new Error(
          'This entry is a recurring expense template. Delete it from the Expenses screen instead.'
        );
      }
      // Remove the source expense too, or it would linger unaccounted.
      await db.runAsync('DELETE FROM expenses WHERE id = ?', [tx.reference_id]);
    } else if (tx.reference_type === 'other_income' && tx.reference_id) {
      await db.runAsync('DELETE FROM other_income WHERE id = ?', [tx.reference_id]);
    } else if (tx.type === 'transfer') {
      // A transfer has two legs; deleting one must delete its pair or the two
      // accounts fall out of sync.
      const pair =
        tx.reference_type === 'transfer' && tx.reference_id
          ? await db.getFirstAsync<Transaction>(
              `SELECT * FROM transactions WHERE reference_type = 'transfer' AND reference_id = ? AND id != ?`,
              [tx.reference_id, id]
            )
          : await db.getFirstAsync<Transaction>(
              `SELECT * FROM transactions WHERE type = 'transfer' AND date = ? AND amount = ? AND id != ? ORDER BY ABS(id - ?) ASC LIMIT 1`,
              [tx.date, -tx.amount, id, id]
            );
      if (pair) {
        await updateAccountBalance(db, pair.account_id, -pair.amount);
        await db.runAsync('DELETE FROM transactions WHERE id = ?', [pair.id]);
      }
    }

    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  });

}

export async function transferBetweenAccounts(params: {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  date: string;
  description?: string;
}): Promise<void> {
  if (!params.from_account_id || !params.to_account_id) {
    throw new Error('Select both accounts');
  }
  if (params.from_account_id === params.to_account_id) {
    throw new Error('Choose two different accounts');
  }
  const amount = assertPositiveAmount(params.amount);

  const db = await getDatabase();
  const desc = params.description ?? 'Account transfer';

  const fromAccount = await getAccountById(params.from_account_id);
  const toAccount = await getAccountById(params.to_account_id);
  if (!fromAccount || !toAccount) throw new Error('Account not found');
  if (fromAccount.is_excluded || toAccount.is_excluded) {
    throw new Error('Cannot transfer to or from a deactivated account');
  }

  await db.withTransactionAsync(async () => {
    const freshFrom = await db.getFirstAsync<Account>(
      'SELECT * FROM accounts WHERE id = ?',
      [params.from_account_id]
    );
    if (!freshFrom) throw new Error('Account not found');
    if (roundMoney(freshFrom.current_balance) < amount) {
      throw new Error('Insufficient balance in the source account');
    }

    const outId = await recordTransaction(db, {
      account_id: params.from_account_id,
      type: 'transfer',
      amount: -amount,
      description: `${desc} (out)`,
      date: params.date,
    });
    // Link both legs by the out-leg id so deleting either removes the pair.
    await db.runAsync(
      `UPDATE transactions SET reference_type = 'transfer', reference_id = ? WHERE id = ?`,
      [outId, outId]
    );
    await recordTransaction(db, {
      account_id: params.to_account_id,
      type: 'transfer',
      amount,
      reference_type: 'transfer',
      reference_id: outId,
      description: `${desc} (in)`,
      date: params.date,
    });
  });

}

export async function recordDeposit(params: {
  account_id: number;
  amount: number;
  date: string;
  description?: string;
}): Promise<void> {
  if (!params.account_id) {
    throw new Error('Select an account');
  }
  const amount = assertPositiveAmount(params.amount);

  const db = await getDatabase();
  const account = await getAccountById(params.account_id);
  if (!account) throw new Error('Account not found');
  if (account.is_excluded) throw new Error('Cannot use an excluded account');

  await db.withTransactionAsync(async () => {
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'deposit',
      amount,
      description: params.description?.trim() || `Deposit — ${account.name}`,
      date: params.date,
    });
  });

}

export async function recordWithdrawal(params: {
  account_id: number;
  amount: number;
  date: string;
  description?: string;
}): Promise<void> {
  if (!params.account_id) {
    throw new Error('Select an account');
  }
  const amount = assertPositiveAmount(params.amount);

  const db = await getDatabase();
  const account = await getAccountById(params.account_id);
  if (!account) throw new Error('Account not found');
  if (account.is_excluded) throw new Error('Cannot use an excluded account');

  await db.withTransactionAsync(async () => {
    const fresh = await db.getFirstAsync<Account>(
      'SELECT * FROM accounts WHERE id = ?',
      [params.account_id]
    );
    if (!fresh) throw new Error('Account not found');
    if (roundMoney(fresh.current_balance) < amount) {
      throw new Error('Insufficient balance in this account');
    }

    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'withdrawal',
      amount: -amount,
      description: params.description?.trim() || `Withdrawal — ${account.name}`,
      date: params.date,
    });
  });

}

function advanceByRecurrence(dateStr: string, recurrence: string): string {
  const date = parse(dateStr, 'yyyy-MM-dd', new Date());
  switch (recurrence) {
    case 'Weekly':
      return format(addWeeks(date, 1), 'yyyy-MM-dd');
    case 'Yearly':
      return format(addYears(date, 1), 'yyyy-MM-dd');
    case 'Monthly':
    default:
      return format(addMonths(date, 1), 'yyyy-MM-dd');
  }
}

const LAST_RECURRING_PROCESS_KEY = 'last_recurring_process_date';

/** Generate due recurring expense entries that have not yet been created. */
export async function processRecurringExpenses(): Promise<number> {
  const today = todayISO();
  const lastRun = await AsyncStorage.getItem(LAST_RECURRING_PROCESS_KEY);
  if (lastRun === today) {
    return 0;
  }

  const db = await getDatabase();
  let created = 0;

  // Skip templates tied to deactivated accounts — new outflows must never
  // post to an excluded account.
  const templates = await db.getAllAsync<Expense>(
    `SELECT e.* FROM expenses e
     JOIN accounts a ON a.id = e.account_id
     WHERE e.is_recurring = 1 AND COALESCE(a.is_excluded, 0) = 0`
  );

  for (const template of templates) {
    let nextDate = advanceByRecurrence(template.date, template.recurrence ?? 'Monthly');
    const recurrence = template.recurrence ?? 'Monthly';

    while (nextDate <= today) {
      const existing = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM expenses
         WHERE category = ? AND description = ? AND amount = ? AND account_id = ?
         AND date = ? AND is_recurring = 0`,
        [
          template.category,
          template.description,
          template.amount,
          template.account_id,
          nextDate,
        ]
      );

      if (!existing) {
        await db.withTransactionAsync(async () => {
          const result = await db.runAsync(
            `INSERT INTO expenses (category, description, amount, account_id, date, is_recurring, recurrence)
             VALUES (?, ?, ?, ?, ?, 0, NULL)`,
            [
              template.category,
              template.description,
              template.amount,
              template.account_id,
              nextDate,
            ]
          );
          await recordTransaction(db, {
            account_id: template.account_id,
            type: 'expense',
            amount: -template.amount,
            reference_type: 'expense',
            reference_id: result.lastInsertRowId,
            description: `${template.category}: ${template.description}`,
            date: nextDate,
          });
        });
        created += 1;
      }

      nextDate = advanceByRecurrence(nextDate, recurrence);
    }
  }

  await AsyncStorage.setItem(LAST_RECURRING_PROCESS_KEY, today);
  return created;
}

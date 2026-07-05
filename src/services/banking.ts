import { getDatabase, getPaymentStatus, recordTransaction } from '../db/database';
import { getMonthRange } from '../utils/date';
import { triggerAutoBackup } from './backup';
import { getPurchaseById } from './purchases';
import { getSaleById } from './sales';
import type { Account, BalanceSheet, Expense, FixedAsset, Transaction } from '../types';

export async function getAccounts(): Promise<Account[]> {
  const db = await getDatabase();
  return db.getAllAsync<Account>('SELECT * FROM accounts ORDER BY name ASC');
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
  const opening = params.opening_balance ?? 0;

  const result = await db.runAsync(
    `INSERT INTO accounts (name, type, opening_balance, current_balance) VALUES (?, ?, ?, ?)`,
    [params.name, params.type, opening, 0]
  );

  const accountId = result.lastInsertRowId;

  if (opening !== 0) {
    await recordTransaction(db, {
      account_id: accountId,
      type: 'opening',
      amount: opening,
      description: `Opening balance - ${params.name}`,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  await triggerAutoBackup();
  return accountId;
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
    'SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts'
  );
  return row?.total ?? 0;
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

  const db = await getDatabase();

  let expenseId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO expenses (category, description, amount, account_id, date, is_recurring, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.category,
        params.description,
        params.amount,
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
      amount: -params.amount,
      reference_type: 'expense',
      reference_id: expenseId,
      description: `${params.category}: ${params.description}`,
      date: params.date,
    });
  });

  await triggerAutoBackup();
  return expenseId;
}

export async function getExpenses(monthKey?: string): Promise<Expense[]> {
  const db = await getDatabase();
  if (monthKey) {
    const { start, end } = getMonthRange(monthKey);
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

  const db = await getDatabase();
  const existing = await getExpenseById(id);
  if (!existing) throw new Error('Expense not found');

  await db.withTransactionAsync(async () => {
    const tx = await db.getFirstAsync<Transaction>(
      `SELECT * FROM transactions WHERE reference_type = 'expense' AND reference_id = ? LIMIT 1`,
      [id]
    );
    if (tx) {
      await db.runAsync('UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?', [
        tx.amount,
        tx.account_id,
      ]);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
    }

    await db.runAsync(
      `UPDATE expenses SET category = ?, description = ?, amount = ?, account_id = ?, date = ?, is_recurring = ?, recurrence = ? WHERE id = ?`,
      [
        params.category,
        params.description,
        params.amount,
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
      amount: -params.amount,
      reference_type: 'expense',
      reference_id: id,
      description: `${params.category}: ${params.description}`,
      date: params.date,
    });
  });

  await triggerAutoBackup();
}

export async function deleteExpense(id: number): Promise<void> {
  const db = await getDatabase();
  const tx = await db.getFirstAsync<Transaction>(
    `SELECT * FROM transactions WHERE reference_type = 'expense' AND reference_id = ? LIMIT 1`,
    [id]
  );

  await db.withTransactionAsync(async () => {
    if (tx) {
      await db.runAsync('UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?', [
        tx.amount,
        tx.account_id,
      ]);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
    }
    await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  });

  await triggerAutoBackup();
}

export async function getBalanceSheet(): Promise<BalanceSheet> {
  const db = await getDatabase();

  const cashBank = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts'
  );

  const inventory = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(current_qty * avg_cost), 0) as total FROM products'
  );

  const receivables = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total FROM sales WHERE paid_amount < total_amount`
  );

  const payables = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total FROM purchases WHERE paid_amount < total_amount`
  );

  const fixedAssets = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(value), 0) as total FROM fixed_assets'
  );

  const cash = cashBank?.total ?? 0;
  const inv = inventory?.total ?? 0;
  const recv = receivables?.total ?? 0;
  const fixed = fixedAssets?.total ?? 0;
  const pay = payables?.total ?? 0;
  const totalAssets = cash + inv + recv + fixed;

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
      total: pay,
    },
    equity: totalAssets - pay,
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
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO fixed_assets (name, value, notes) VALUES (?, ?, ?)`,
    [params.name, params.value, params.notes ?? null]
  );
  await triggerAutoBackup();
  return result.lastInsertRowId;
}

export async function updateFixedAsset(
  id: number,
  params: { name: string; value: number; notes?: string }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE fixed_assets SET name = ?, value = ?, notes = ? WHERE id = ?`, [
    params.name,
    params.value,
    params.notes ?? null,
    id,
  ]);
  await triggerAutoBackup();
}

export async function deleteFixedAsset(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM fixed_assets WHERE id = ?', [id]);
  await triggerAutoBackup();
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  const tx = await db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!tx) throw new Error('Transaction not found');

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?', [
      tx.amount,
      tx.account_id,
    ]);

    if (tx.reference_type === 'sale' && tx.reference_id) {
      const payment = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM sale_payments WHERE sale_id = ? AND account_id = ? AND amount = ? AND date = ? LIMIT 1`,
        [tx.reference_id, tx.account_id, tx.amount, tx.date]
      );
      if (payment) {
        await db.runAsync('DELETE FROM sale_payments WHERE id = ?', [payment.id]);
      }
      const sale = await getSaleById(tx.reference_id);
      if (sale) {
        const newPaid = Math.max(0, sale.paid_amount - tx.amount);
        const status = getPaymentStatus(sale.total_amount, newPaid);
        await db.runAsync('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?', [
          newPaid,
          status,
          tx.reference_id,
        ]);
      }
    }

    if (tx.reference_type === 'purchase' && tx.reference_id) {
      const paidAmount = Math.abs(tx.amount);
      const payment = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM purchase_payments WHERE purchase_id = ? AND account_id = ? AND amount = ? AND date = ? LIMIT 1`,
        [tx.reference_id, tx.account_id, paidAmount, tx.date]
      );
      if (payment) {
        await db.runAsync('DELETE FROM purchase_payments WHERE id = ?', [payment.id]);
      }
      const purchase = await getPurchaseById(tx.reference_id);
      if (purchase) {
        const newPaid = Math.max(0, purchase.paid_amount - paidAmount);
        const status = getPaymentStatus(purchase.total_amount, newPaid);
        await db.runAsync('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?', [
          newPaid,
          status,
          tx.reference_id,
        ]);
      }
    }

    if (tx.reference_type === 'expense' && tx.reference_id) {
      await db.runAsync('DELETE FROM expenses WHERE id = ?', [tx.reference_id]);
    }

    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  });

  await triggerAutoBackup();
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
  if (params.amount <= 0) {
    throw new Error('Enter a valid amount');
  }

  const db = await getDatabase();
  const desc = params.description ?? 'Account transfer';

  await db.withTransactionAsync(async () => {
    await recordTransaction(db, {
      account_id: params.from_account_id,
      type: 'transfer',
      amount: -params.amount,
      description: `${desc} (out)`,
      date: params.date,
    });
    await recordTransaction(db, {
      account_id: params.to_account_id,
      type: 'transfer',
      amount: params.amount,
      description: `${desc} (in)`,
      date: params.date,
    });
  });

  await triggerAutoBackup();
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
  if (params.amount <= 0) {
    throw new Error('Enter a valid amount');
  }

  const db = await getDatabase();
  const account = await getAccountById(params.account_id);
  if (!account) throw new Error('Account not found');

  await db.withTransactionAsync(async () => {
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'deposit',
      amount: params.amount,
      description: params.description?.trim() || `Deposit — ${account.name}`,
      date: params.date,
    });
  });

  await triggerAutoBackup();
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
  if (params.amount <= 0) {
    throw new Error('Enter a valid amount');
  }

  const db = await getDatabase();
  const account = await getAccountById(params.account_id);
  if (!account) throw new Error('Account not found');
  if (account.current_balance + 0.01 < params.amount) {
    throw new Error('Insufficient balance in this account');
  }

  await db.withTransactionAsync(async () => {
    await recordTransaction(db, {
      account_id: params.account_id,
      type: 'withdrawal',
      amount: -params.amount,
      description: params.description?.trim() || `Withdrawal — ${account.name}`,
      date: params.date,
    });
  });

  await triggerAutoBackup();
}

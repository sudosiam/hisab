import { getDatabase, initializeFreshDatabase } from '../../db/database';
import { toPaise } from '../../utils/money';
import {
  addFixedAsset,
  createExpense,
  getBalanceSheet,
  getExpenseById,
} from '../banking';
import { borrowMoney, collectLent, getLoanById, lendMoney, repayBorrow } from '../loans';
import { getPeriodFinancials } from '../financials';

const TEST_DATE = '2026-03-15';
const PERIOD = '2026-03';

async function getCashAccount(): Promise<{ id: number; balance: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number; current_balance: number }>(
    `SELECT id, current_balance FROM accounts WHERE type = 'cash' ORDER BY id LIMIT 1`
  );
  if (!row) throw new Error('Cash account was not seeded');
  return { id: row.id, balance: row.current_balance };
}

async function cashBalance(accountId: number): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ current_balance: number }>(
    `SELECT current_balance FROM accounts WHERE id = ?`,
    [accountId]
  );
  return row?.current_balance ?? 0;
}

describe('Money lent & borrowed funding', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('lends money: cash down, receivable outstanding up', async () => {
    const cash = await getCashAccount();
    const amount = toPaise(5000);
    const loanId = await lendMoney({
      lender_name: 'Ravi',
      principal_amount: amount,
      account_id: cash.id,
      start_date: TEST_DATE,
    });

    const loan = await getLoanById(loanId);
    expect(loan?.direction).toBe('lent');
    expect(loan?.outstanding_amount).toBe(amount);
    expect(await cashBalance(cash.id)).toBe(cash.balance - amount);

    const sheet = await getBalanceSheet();
    expect(sheet.assets.moneyLent).toBe(amount);
  });

  it('borrow-funded expense: cash same, outstanding up, P&L expense', async () => {
    const cash = await getCashAccount();
    const loanId = await borrowMoney({
      lender_name: 'Bank',
      principal_amount: toPaise(10000),
      start_date: TEST_DATE,
    });
    const before = await cashBalance(cash.id);
    const expenseAmt = toPaise(1500);

    const expenseId = await createExpense({
      category: 'Rent',
      description: 'Shop rent on borrow',
      amount: expenseAmt,
      loan_id: loanId,
      date: TEST_DATE,
    });

    expect(await cashBalance(cash.id)).toBe(before);
    const loan = await getLoanById(loanId);
    expect(loan?.outstanding_amount).toBe(toPaise(10000) + expenseAmt);

    const expense = await getExpenseById(expenseId);
    expect(expense?.loan_id).toBe(loanId);
    expect(expense?.account_id).toBeNull();

    const pnl = await getPeriodFinancials(PERIOD);
    expect(pnl.expenses).toBe(expenseAmt);
  });

  it('repay borrow: cash down, outstanding down', async () => {
    const cash = await getCashAccount();
    const loanId = await borrowMoney({
      lender_name: 'Friend',
      principal_amount: toPaise(2000),
      start_date: TEST_DATE,
    });
    const before = await cashBalance(cash.id);
    const repay = toPaise(800);

    await repayBorrow({
      loanId,
      account_id: cash.id,
      amount: repay,
      date: TEST_DATE,
    });

    expect(await cashBalance(cash.id)).toBe(before - repay);
    expect((await getLoanById(loanId))?.outstanding_amount).toBe(toPaise(1200));
  });

  it('fixed asset on borrow: asset + outstanding, cash unchanged', async () => {
    const cash = await getCashAccount();
    const loanId = await borrowMoney({
      lender_name: 'NBFC',
      principal_amount: toPaise(1000),
      start_date: TEST_DATE,
    });
    const before = await cashBalance(cash.id);
    const value = toPaise(25000);

    await addFixedAsset({
      name: 'Mixer',
      value,
      paid_from: 'borrowed',
      loan_id: loanId,
      date: TEST_DATE,
    });

    expect(await cashBalance(cash.id)).toBe(before);
    expect((await getLoanById(loanId))?.outstanding_amount).toBe(toPaise(1000) + value);
    const sheet = await getBalanceSheet();
    expect(sheet.assets.fixedAssets).toBe(value);
    expect(sheet.liabilities.loans).toBe(toPaise(1000) + value);
  });

  it('collect lent: cash up, receivable down', async () => {
    const cash = await getCashAccount();
    const amount = toPaise(3000);
    const loanId = await lendMoney({
      lender_name: 'Asha',
      principal_amount: amount,
      account_id: cash.id,
      start_date: TEST_DATE,
    });
    const afterLend = await cashBalance(cash.id);
    const collect = toPaise(1000);

    await collectLent({
      loanId,
      account_id: cash.id,
      amount: collect,
      date: TEST_DATE,
    });

    expect(await cashBalance(cash.id)).toBe(afterLend + collect);
    expect((await getLoanById(loanId))?.outstanding_amount).toBe(toPaise(2000));
    expect((await getBalanceSheet()).assets.moneyLent).toBe(toPaise(2000));
  });

  it('blocks delete when loan is linked to expense or fixed asset', async () => {
    const loanId = await borrowMoney({
      lender_name: 'Bank',
      principal_amount: toPaise(5000),
      start_date: TEST_DATE,
    });
    await createExpense({
      category: 'Rent',
      description: 'Linked',
      amount: toPaise(500),
      loan_id: loanId,
      date: TEST_DATE,
    });

    const { deleteLoan } = await import('../loans');
    await expect(deleteLoan(loanId)).rejects.toThrow(/linked to expenses/);

    const db = await getDatabase();
    await db.runAsync('DELETE FROM expenses WHERE loan_id = ?', [loanId]);

    await addFixedAsset({
      name: 'Desk',
      value: toPaise(10000),
      paid_from: 'borrowed',
      loan_id: loanId,
      date: TEST_DATE,
    });
    await expect(deleteLoan(loanId)).rejects.toThrow(/linked to fixed assets/);
  });
});

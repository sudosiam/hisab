import type * as SQLite from 'expo-sqlite';
import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';
import type { PartyStatementLine, PartyStatementResult, PartyType } from '../types';

export type LedgerAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface LedgerAccount {
  id: number;
  name: string;
  account_type: LedgerAccountType;
  system_key: string | null;
  cash_account_id: number | null;
  expense_category: string | null;
}

const SYSTEM_ACCOUNTS: {
  system_key: string;
  name: string;
  account_type: LedgerAccountType;
}[] = [
  { system_key: 'ar', name: 'Accounts Receivable', account_type: 'asset' },
  { system_key: 'ap', name: 'Accounts Payable', account_type: 'liability' },
  { system_key: 'sales', name: 'Sales Revenue', account_type: 'income' },
  { system_key: 'cogs', name: 'Cost of Goods Sold', account_type: 'expense' },
  { system_key: 'purchases', name: 'Purchases', account_type: 'expense' },
  { system_key: 'other_income', name: 'Other Income', account_type: 'income' },
  { system_key: 'equity', name: "Owner's Equity", account_type: 'equity' },
  { system_key: 'inventory', name: 'Inventory', account_type: 'asset' },
  { system_key: 'fixed_assets', name: 'Fixed Assets', account_type: 'asset' },
  { system_key: 'loans', name: 'Loans Payable', account_type: 'liability' },
];

interface JournalLineInput {
  ledgerAccountId: number;
  partyId?: number | null;
  debit: number;
  credit: number;
}

async function postJournalEntry(
  db: SQLite.SQLiteDatabase,
  params: {
    date: string;
    description: string;
    referenceType?: string | null;
    referenceId?: number | null;
    lines: JournalLineInput[];
  }
): Promise<number> {
  const totalDebit = roundMoney(params.lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundMoney(params.lines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.009) {
    throw new Error(`Journal entry not balanced: Dr ${totalDebit} Cr ${totalCredit}`);
  }
  if (params.lines.length < 2) {
    throw new Error('Journal entry requires at least two lines');
  }

  const entry = await db.runAsync(
    `INSERT INTO journal_entries (entry_date, description, reference_type, reference_id)
     VALUES (?, ?, ?, ?)`,
    [params.date, params.description, params.referenceType ?? null, params.referenceId ?? null]
  );
  const journalEntryId = entry.lastInsertRowId;

  for (const line of params.lines) {
    await db.runAsync(
      `INSERT INTO journal_lines (journal_entry_id, ledger_account_id, party_id, debit, credit)
       VALUES (?, ?, ?, ?, ?)`,
      [
        journalEntryId,
        line.ledgerAccountId,
        line.partyId ?? null,
        roundMoney(line.debit),
        roundMoney(line.credit),
      ]
    );
  }

  return journalEntryId;
}

export async function seedLedgerAccounts(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const account of SYSTEM_ACCOUNTS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO ledger_accounts (name, account_type, system_key)
       VALUES (?, ?, ?)`,
      [account.name, account.account_type, account.system_key]
    );
  }

  const cashAccounts = await db.getAllAsync<{ id: number; name: string; type: string }>(
    `SELECT id, name, type FROM accounts`
  );
  for (const cash of cashAccounts) {
    const existing = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM ledger_accounts WHERE cash_account_id = ?`,
      [cash.id]
    );
    if (!existing) {
      await db.runAsync(
        `INSERT INTO ledger_accounts (name, account_type, system_key, cash_account_id)
         VALUES (?, 'asset', NULL, ?)`,
        [`${cash.name} (${cash.type})`, cash.id]
      );
    }
  }
}

async function getLedgerAccountMap(db: SQLite.SQLiteDatabase): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ id: number; system_key: string | null; cash_account_id: number | null }>(
    `SELECT id, system_key, cash_account_id FROM ledger_accounts`
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.system_key) map.set(row.system_key, row.id);
    if (row.cash_account_id) map.set(`cash:${row.cash_account_id}`, row.id);
  }
  return map;
}

async function getOrCreateExpenseLedgerAccount(
  db: SQLite.SQLiteDatabase,
  category: string
): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM ledger_accounts WHERE expense_category = ? COLLATE NOCASE`,
    [category]
  );
  if (existing) return existing.id;

  const result = await db.runAsync(
    `INSERT INTO ledger_accounts (name, account_type, expense_category)
     VALUES (?, 'expense', ?)`,
    [`Expense: ${category}`, category]
  );
  return result.lastInsertRowId;
}

async function resolvePartyId(
  db: SQLite.SQLiteDatabase,
  name: string,
  type: PartyType,
  partyId?: number | null
): Promise<number | null> {
  if (partyId) return partyId;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM parties WHERE name = ? COLLATE NOCASE AND type = ?`,
    [trimmed, type]
  );
  return row?.id ?? null;
}

/** Pass `db` when called during database init to avoid a getDatabase deadlock. */
export async function hasGeneralLedger(db?: SQLite.SQLiteDatabase): Promise<boolean> {
  const database = db ?? (await getDatabase());
  const table = await database.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='journal_entries'`
  );
  if (!table) return false;
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM journal_entries`
  );
  return (row?.count ?? 0) > 0;
}

const LEDGER_CODE_VERSION = '4';
let rebuildInFlight: Promise<void> | null = null;
let ledgerRefreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesce ledger rebuilds so rapid saves do not block the UI thread repeatedly. */
export function scheduleGeneralLedgerRefresh(): void {
  if (ledgerRefreshTimer) clearTimeout(ledgerRefreshTimer);
  ledgerRefreshTimer = setTimeout(() => {
    ledgerRefreshTimer = null;
    void rebuildGeneralLedger().catch(() => {});
  }, 400);
  if (ledgerRefreshTimer && typeof ledgerRefreshTimer === 'object' && 'unref' in ledgerRefreshTimer) {
    (ledgerRefreshTimer as NodeJS.Timeout).unref();
  }
}

/** Refresh ledger after a business write without running full integrity repair. */
export async function refreshGeneralLedgerAfterWrite(): Promise<void> {
  scheduleGeneralLedgerRefresh();
}

/** Rebuild once after app updates when ledger posting rules change. Safe to call after UI is ready. */
export async function ensureLedgerUpToDate(db?: SQLite.SQLiteDatabase): Promise<void> {
  const database = db ?? (await getDatabase());
  const table = await database.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='journal_entries'`
  );
  if (!table) return;

  const row = await database.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'ledger_code_version'`
  );
  if (row?.value === LEDGER_CODE_VERSION) return;

  await rebuildGeneralLedger(database);
  await database.runAsync(
    `INSERT OR REPLACE INTO settings (key, value) VALUES ('ledger_code_version', ?)`,
    [LEDGER_CODE_VERSION]
  );
}

/** Rebuild the general ledger from all business records (double-entry). */
export async function rebuildGeneralLedger(db?: SQLite.SQLiteDatabase): Promise<void> {
  if (rebuildInFlight) {
    await rebuildInFlight;
    return;
  }

  rebuildInFlight = (async () => {
  const database = db ?? (await getDatabase());

  const table = await database.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='journal_entries'`
  );
  if (!table) return;

  await seedLedgerAccounts(database);
  const accounts = await getLedgerAccountMap(database);

  const salesAccount = accounts.get('sales');
  const cogsAccount = accounts.get('cogs');
  const arAccount = accounts.get('ar');
  const apAccount = accounts.get('ap');
  const inventoryAccount = accounts.get('inventory');
  const otherIncomeAccount = accounts.get('other_income');
  const equityAccount = accounts.get('equity');
  const fixedAssetsAccount = accounts.get('fixed_assets');
  const loansAccount = accounts.get('loans');

  if (
    !salesAccount ||
    !cogsAccount ||
    !arAccount ||
    !apAccount ||
    !inventoryAccount ||
    !otherIncomeAccount ||
    !equityAccount ||
    !fixedAssetsAccount ||
    !loansAccount
  ) {
    return;
  }

  await database.withTransactionAsync(async () => {
  await database.execAsync('DELETE FROM journal_lines; DELETE FROM journal_entries;');

  const sales = await database.getAllAsync<{
    id: number;
    invoice_no: string;
    invoice_type: string | null;
    party_name: string;
    party_id: number | null;
    date: string;
    total_amount: number;
  }>(
    `SELECT s.id, s.invoice_no, s.invoice_type, s.party_name, s.party_id, s.date, s.total_amount
     FROM sales s
     WHERE EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
       AND s.total_amount > 0`
  );

  for (const sale of sales) {
    const partyId = await resolvePartyId(database, sale.party_name, 'customer', sale.party_id);
    const amount = roundMoney(sale.total_amount);
    const docLabel = sale.invoice_type === 'bos' ? 'Bill of Supply' : 'Invoice';
    await postJournalEntry(database, {
      date: sale.date,
      description: `${docLabel} ${sale.invoice_no}`,
      referenceType: 'sale',
      referenceId: sale.id,
      lines: [
        { ledgerAccountId: arAccount, partyId, debit: amount, credit: 0 },
        { ledgerAccountId: salesAccount, debit: 0, credit: amount },
      ],
    });
  }

  const salePayments = await database.getAllAsync<{
    id: number;
    sale_id: number;
    account_id: number;
    amount: number;
    date: string;
    invoice_no: string;
    party_name: string;
    party_id: number | null;
  }>(
    `SELECT sp.id, sp.sale_id, sp.account_id, sp.amount, sp.date,
            s.invoice_no, s.party_name, s.party_id
     FROM sale_payments sp
     JOIN sales s ON s.id = sp.sale_id
     WHERE sp.amount > 0`
  );

  for (const payment of salePayments) {
    const cashAccount = accounts.get(`cash:${payment.account_id}`);
    if (!cashAccount) continue;
    const partyId = await resolvePartyId(database, payment.party_name, 'customer', payment.party_id);
    const amount = roundMoney(payment.amount);
    await postJournalEntry(database, {
      date: payment.date,
      description: `Payment — ${payment.invoice_no}`,
      referenceType: 'sale_payment',
      referenceId: payment.id,
      lines: [
        { ledgerAccountId: cashAccount, debit: amount, credit: 0 },
        { ledgerAccountId: arAccount, partyId, debit: 0, credit: amount },
      ],
    });
  }

  const saleCogsRows = await database.getAllAsync<{
    id: number;
    invoice_no: string;
    date: string;
    cogs: number;
  }>(
    `SELECT s.id, s.invoice_no, s.date,
            COALESCE(SUM(
              COALESCE(NULLIF(si.unit_cost, 0), p.avg_cost, 0) * si.qty
            ), 0) as cogs
     FROM sales s
     JOIN sale_items si ON si.sale_id = s.id
     JOIN products p ON p.id = si.product_id
     GROUP BY s.id
     HAVING cogs > 0.009`
  );

  for (const saleCogs of saleCogsRows) {
    const amount = roundMoney(saleCogs.cogs);
    await postJournalEntry(database, {
      date: saleCogs.date,
      description: `COGS — ${saleCogs.invoice_no}`,
      referenceType: 'sale_cogs',
      referenceId: saleCogs.id,
      lines: [
        { ledgerAccountId: cogsAccount, debit: amount, credit: 0 },
        { ledgerAccountId: inventoryAccount, debit: 0, credit: amount },
      ],
    });
  }

  const purchases = await database.getAllAsync<{
    id: number;
    invoice_no: string;
    supplier_name: string;
    party_id: number | null;
    date: string;
    total_amount: number;
  }>(
    `SELECT p.id, p.invoice_no, p.supplier_name, p.party_id, p.date, p.total_amount
     FROM purchases p
     WHERE EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
       AND p.total_amount > 0`
  );

  for (const purchase of purchases) {
    const partyId = await resolvePartyId(database, purchase.supplier_name, 'vendor', purchase.party_id);
    const amount = roundMoney(purchase.total_amount);
    await postJournalEntry(database, {
      date: purchase.date,
      description: `Bill ${purchase.invoice_no}`,
      referenceType: 'purchase',
      referenceId: purchase.id,
      lines: [
        { ledgerAccountId: inventoryAccount, debit: amount, credit: 0 },
        { ledgerAccountId: apAccount, partyId, debit: 0, credit: amount },
      ],
    });
  }

  const purchasePayments = await database.getAllAsync<{
    id: number;
    account_id: number;
    amount: number;
    date: string;
    invoice_no: string;
    supplier_name: string;
    party_id: number | null;
  }>(
    `SELECT pp.id, pp.account_id, pp.amount, pp.date,
            p.invoice_no, p.supplier_name, p.party_id
     FROM purchase_payments pp
     JOIN purchases p ON p.id = pp.purchase_id
     WHERE pp.amount > 0`
  );

  for (const payment of purchasePayments) {
    const cashAccount = accounts.get(`cash:${payment.account_id}`);
    if (!cashAccount) continue;
    const partyId = await resolvePartyId(database, payment.supplier_name, 'vendor', payment.party_id);
    const amount = roundMoney(payment.amount);
    await postJournalEntry(database, {
      date: payment.date,
      description: `Payment — ${payment.invoice_no}`,
      referenceType: 'purchase_payment',
      referenceId: payment.id,
      lines: [
        { ledgerAccountId: apAccount, partyId, debit: amount, credit: 0 },
        { ledgerAccountId: cashAccount, debit: 0, credit: amount },
      ],
    });
  }

  const expenses = await database.getAllAsync<{
    id: number;
    category: string;
    description: string;
    amount: number;
    account_id: number;
    date: string;
  }>(`SELECT id, category, description, amount, account_id, date FROM expenses WHERE amount > 0`);

  for (const expense of expenses) {
    const cashAccount = accounts.get(`cash:${expense.account_id}`);
    if (!cashAccount) continue;
    const expenseAccount = await getOrCreateExpenseLedgerAccount(database, expense.category);
    const amount = roundMoney(expense.amount);
    await postJournalEntry(database, {
      date: expense.date,
      description: `${expense.category}: ${expense.description}`,
      referenceType: 'expense',
      referenceId: expense.id,
      lines: [
        { ledgerAccountId: expenseAccount, debit: amount, credit: 0 },
        { ledgerAccountId: cashAccount, debit: 0, credit: amount },
      ],
    });
  }

  const otherIncomeRows = await database.getAllAsync<{
    id: number;
    category: string;
    description: string;
    amount: number;
    account_id: number;
    date: string;
  }>(`SELECT id, category, description, amount, account_id, date FROM other_income WHERE amount > 0`);

  for (const row of otherIncomeRows) {
    const cashAccount = accounts.get(`cash:${row.account_id}`);
    if (!cashAccount) continue;
    const amount = roundMoney(row.amount);
    await postJournalEntry(database, {
      date: row.date,
      description: `${row.category}: ${row.description}`,
      referenceType: 'other_income',
      referenceId: row.id,
      lines: [
        { ledgerAccountId: cashAccount, debit: amount, credit: 0 },
        { ledgerAccountId: otherIncomeAccount, debit: 0, credit: amount },
      ],
    });
  }

  const stockMovements = await database.getAllAsync<{
    id: number;
    qty: number;
    unit_cost: number;
    type: string;
    notes: string | null;
    product_name: string;
    movement_date: string;
  }>(
    `SELECT im.id, im.qty, im.unit_cost, im.type, im.notes, p.name as product_name,
            COALESCE(substr(im.created_at, 1, 10), date('now')) as movement_date
     FROM inventory_movements im
     JOIN products p ON p.id = im.product_id
     WHERE im.type IN ('opening', 'adjustment') AND im.qty != 0`
  );

  for (const movement of stockMovements) {
    const amount = roundMoney(Math.abs(movement.qty) * Math.abs(movement.unit_cost));
    if (amount < 0.009) continue;
    const isIncrease = movement.qty > 0;
    const description =
      movement.type === 'opening'
        ? `Opening stock — ${movement.product_name}`
        : movement.notes?.trim() || `Stock adjustment — ${movement.product_name}`;

    await postJournalEntry(database, {
      date: movement.movement_date,
      description,
      referenceType: movement.type === 'opening' ? 'inventory_opening' : 'inventory_adjustment',
      referenceId: movement.id,
      lines: isIncrease
        ? [
            { ledgerAccountId: inventoryAccount, debit: amount, credit: 0 },
            { ledgerAccountId: equityAccount, debit: 0, credit: amount },
          ]
        : [
            { ledgerAccountId: equityAccount, debit: amount, credit: 0 },
            { ledgerAccountId: inventoryAccount, debit: 0, credit: amount },
          ],
    });
  }

  const transfers = await database.getAllAsync<{
    id: number;
    account_id: number;
    amount: number;
    date: string;
    description: string;
    reference_id: number | null;
  }>(
    `SELECT id, account_id, amount, date, description, reference_id
     FROM transactions
     WHERE type = 'transfer' AND amount < 0`
  );

  for (const out of transfers) {
    const fromAccount = accounts.get(`cash:${out.account_id}`);
    if (!fromAccount || !out.reference_id) continue;
    const inTx = await database.getFirstAsync<{ account_id: number; amount: number }>(
      `SELECT account_id, amount FROM transactions
       WHERE reference_type = 'transfer' AND reference_id = ? AND amount > 0`,
      [out.id]
    );
    const toAccount = inTx ? accounts.get(`cash:${inTx.account_id}`) : undefined;
    if (!toAccount) continue;
    const amount = roundMoney(Math.abs(out.amount));
    await postJournalEntry(database, {
      date: out.date,
      description: out.description || 'Account transfer',
      referenceType: 'transfer',
      referenceId: out.id,
      lines: [
        { ledgerAccountId: toAccount, debit: amount, credit: 0 },
        { ledgerAccountId: fromAccount, debit: 0, credit: amount },
      ],
    });
  }

  const deposits = await database.getAllAsync<{
    id: number;
    account_id: number;
    amount: number;
    date: string;
    description: string;
  }>(`SELECT id, account_id, amount, date, description FROM transactions WHERE type = 'deposit' AND amount > 0`);

  const openings = await database.getAllAsync<{
    id: number;
    account_id: number;
    amount: number;
    date: string;
    description: string;
  }>(
    `SELECT id, account_id, amount, date, description FROM transactions WHERE type = 'opening' AND amount != 0`
  );

  for (const opening of openings) {
    const cashAccount = accounts.get(`cash:${opening.account_id}`);
    if (!cashAccount) continue;
    const amount = roundMoney(Math.abs(opening.amount));
    const isDebit = opening.amount > 0;
    await postJournalEntry(database, {
      date: opening.date,
      description: opening.description || 'Opening balance',
      referenceType: 'opening',
      referenceId: opening.id,
      lines: isDebit
        ? [
            { ledgerAccountId: cashAccount, debit: amount, credit: 0 },
            { ledgerAccountId: equityAccount, debit: 0, credit: amount },
          ]
        : [
            { ledgerAccountId: equityAccount, debit: amount, credit: 0 },
            { ledgerAccountId: cashAccount, debit: 0, credit: amount },
          ],
    });
  }

  for (const deposit of deposits) {
    const cashAccount = accounts.get(`cash:${deposit.account_id}`);
    if (!cashAccount) continue;
    const amount = roundMoney(deposit.amount);
    await postJournalEntry(database, {
      date: deposit.date,
      description: deposit.description || 'Deposit',
      referenceType: 'deposit',
      referenceId: deposit.id,
      lines: [
        { ledgerAccountId: cashAccount, debit: amount, credit: 0 },
        { ledgerAccountId: equityAccount, debit: 0, credit: amount },
      ],
    });
  }

  const withdrawals = await database.getAllAsync<{
    id: number;
    account_id: number;
    amount: number;
    date: string;
    description: string;
  }>(
    `SELECT id, account_id, amount, date, description FROM transactions WHERE type = 'withdrawal' AND amount < 0`
  );

  for (const withdrawal of withdrawals) {
    const cashAccount = accounts.get(`cash:${withdrawal.account_id}`);
    if (!cashAccount) continue;
    const amount = roundMoney(Math.abs(withdrawal.amount));
    await postJournalEntry(database, {
      date: withdrawal.date,
      description: withdrawal.description || 'Withdrawal',
      referenceType: 'withdrawal',
      referenceId: withdrawal.id,
      lines: [
        { ledgerAccountId: equityAccount, debit: amount, credit: 0 },
        { ledgerAccountId: cashAccount, debit: 0, credit: amount },
      ],
    });
  }

  const fixedAssetRows = await database.getAllAsync<{
    id: number;
    name: string;
    value: number;
    created_at: string;
  }>(`SELECT id, name, value, created_at FROM fixed_assets WHERE value > 0.009`);

  for (const asset of fixedAssetRows) {
    const amount = roundMoney(asset.value);
    await postJournalEntry(database, {
      date: asset.created_at.slice(0, 10),
      description: `Fixed asset — ${asset.name}`,
      referenceType: 'fixed_asset',
      referenceId: asset.id,
      lines: [
        { ledgerAccountId: fixedAssetsAccount, debit: amount, credit: 0 },
        { ledgerAccountId: equityAccount, debit: 0, credit: amount },
      ],
    });
  }

  const loanRows = await database.getAllAsync<{
    id: number;
    lender_name: string;
    outstanding_amount: number;
    start_date: string | null;
    created_at: string;
  }>(
    `SELECT id, lender_name, outstanding_amount, start_date, created_at
     FROM loans WHERE outstanding_amount > 0.009`
  );

  for (const loan of loanRows) {
    const amount = roundMoney(loan.outstanding_amount);
    const entryDate = loan.start_date?.trim() || loan.created_at.slice(0, 10);
    await postJournalEntry(database, {
      date: entryDate,
      description: `Loan — ${loan.lender_name}`,
      referenceType: 'loan',
      referenceId: loan.id,
      lines: [
        { ledgerAccountId: equityAccount, debit: amount, credit: 0 },
        { ledgerAccountId: loansAccount, debit: 0, credit: amount },
      ],
    });
  }
  });
  })();

  try {
    await rebuildInFlight;
  } finally {
    rebuildInFlight = null;
  }
}

function buildRunningBalance(
  partyType: PartyType,
  lines: Omit<PartyStatementLine, 'balance'>[]
): PartyStatementLine[] {
  let balance = 0;
  return lines.map((line, index) => {
    if (partyType === 'customer') {
      balance = roundMoney(balance + line.debit - line.credit);
    } else {
      balance = roundMoney(balance + line.credit - line.debit);
    }
    return { ...line, balance, id: line.id || `line-${index}` };
  });
}

export async function getPartyStatementFromLedger(partyId: number): Promise<PartyStatementLine[]> {
  const db = await getDatabase();
  const party = await db.getFirstAsync<{ id: number; type: PartyType; name: string }>(
    `SELECT id, type, name FROM parties WHERE id = ?`,
    [partyId]
  );
  if (!party) return [];

  const arApKey = party.type === 'customer' ? 'ar' : 'ap';
  const control = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM ledger_accounts WHERE system_key = ?`,
    [arApKey]
  );
  if (!control) return [];

  const invoicePartyMatch =
    party.type === 'customer'
      ? `(s.party_id = ? OR (s.party_id IS NULL AND s.party_name = ? COLLATE NOCASE))`
      : `(p.party_id = ? OR (p.party_id IS NULL AND p.supplier_name = ? COLLATE NOCASE))`;

  const referenceFilter =
    party.type === 'customer'
      ? `(je.reference_type = 'sale' AND EXISTS (
            SELECT 1 FROM sales s
            WHERE s.id = je.reference_id AND ${invoicePartyMatch}
          ))
          OR (je.reference_type = 'sale_payment' AND EXISTS (
            SELECT 1 FROM sale_payments sp
            JOIN sales s ON s.id = sp.sale_id
            WHERE sp.id = je.reference_id AND ${invoicePartyMatch}
          ))`
      : `(je.reference_type = 'purchase' AND EXISTS (
            SELECT 1 FROM purchases p
            WHERE p.id = je.reference_id AND ${invoicePartyMatch}
          ))
          OR (je.reference_type = 'purchase_payment' AND EXISTS (
            SELECT 1 FROM purchase_payments pp
            JOIN purchases p ON p.id = pp.purchase_id
            WHERE pp.id = je.reference_id AND ${invoicePartyMatch}
          ))`;

  const rows = await db.getAllAsync<{
    id: number;
    entry_date: string;
    description: string;
    debit: number;
    credit: number;
    reference_type: string | null;
    reference_id: number | null;
  }>(
    `SELECT jl.id, je.entry_date, je.description, jl.debit, jl.credit,
            je.reference_type, je.reference_id
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.ledger_account_id = ?
       AND (
         jl.party_id = ?
         OR ${referenceFilter}
       )
     ORDER BY je.entry_date ASC, je.id ASC, jl.id ASC`,
    [
      control.id,
      party.id,
      party.id,
      party.name,
      party.id,
      party.name,
    ]
  );

  const lines = rows.map((row) => ({
    id: String(row.id),
    date: row.entry_date,
    description: row.description,
    debit: roundMoney(row.debit),
    credit: roundMoney(row.credit),
    reference_type: (row.reference_type === 'sale'
      ? 'sale'
      : row.reference_type === 'purchase'
        ? 'purchase'
        : 'payment') as PartyStatementLine['reference_type'],
    reference_id: row.reference_id ?? 0,
  }));

  return buildRunningBalance(party.type, lines);
}

export async function getPartyStatementInRangeFromLedger(
  partyId: number,
  startDate: string,
  endDate: string
): Promise<PartyStatementResult> {
  const all = await getPartyStatementFromLedger(partyId);
  const party = await getDatabase().then((db) =>
    db.getFirstAsync<{ type: PartyType }>(`SELECT type FROM parties WHERE id = ?`, [partyId])
  );
  if (!party) return { openingBalance: 0, closingBalance: 0, lines: [] };

  const beforeRange = all.filter((line) => line.date < startDate);
  const openingBalance = beforeRange.length ? beforeRange[beforeRange.length - 1].balance : 0;
  const inRange = all.filter((line) => line.date >= startDate && line.date <= endDate);

  let balance = openingBalance;
  const lines = inRange.map((entry) => {
    if (party.type === 'customer') {
      balance = roundMoney(balance + entry.debit - entry.credit);
    } else {
      balance = roundMoney(balance + entry.credit - entry.debit);
    }
    return { ...entry, balance };
  });

  const closingBalance = lines.length ? lines[lines.length - 1].balance : openingBalance;
  return { openingBalance, closingBalance, lines };
}

export interface GeneralLedgerLine {
  id: string;
  date: string;
  description: string;
  accountName: string;
  debit: number;
  credit: number;
}

export async function getGeneralLedgerReport(
  startDate: string,
  endDate: string
): Promise<GeneralLedgerLine[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    entry_date: string;
    description: string;
    account_name: string;
    debit: number;
    credit: number;
  }>(
    `SELECT jl.id, je.entry_date, je.description, la.name as account_name, jl.debit, jl.credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN ledger_accounts la ON la.id = jl.ledger_account_id
     WHERE je.entry_date >= ? AND je.entry_date <= ?
     ORDER BY je.entry_date ASC, je.id ASC, jl.id ASC`,
    [startDate, endDate]
  );

  return rows.map((row) => ({
    id: String(row.id),
    date: row.entry_date,
    description: row.description,
    accountName: row.account_name,
    debit: roundMoney(row.debit),
    credit: roundMoney(row.credit),
  }));
}

export interface TrialBalanceLedgerRow {
  account: string;
  debit: number;
  credit: number;
}

export async function getTrialBalanceFromLedger(): Promise<{
  rows: TrialBalanceLedgerRow[];
  totalDebit: number;
  totalCredit: number;
}> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ account: string; net: number }>(
    `SELECT la.name as account,
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as net
     FROM ledger_accounts la
     LEFT JOIN journal_lines jl ON jl.ledger_account_id = la.id
     GROUP BY la.id
     HAVING ABS(net) > 0.009
     ORDER BY la.account_type, la.name`
  );

  const mapped = rows.map((row) => ({
    account: row.account,
    debit: row.net > 0.009 ? roundMoney(row.net) : 0,
    credit: row.net < -0.009 ? roundMoney(Math.abs(row.net)) : 0,
  }));

  return {
    rows: mapped,
    totalDebit: roundMoney(mapped.reduce((sum, row) => sum + row.debit, 0)),
    totalCredit: roundMoney(mapped.reduce((sum, row) => sum + row.credit, 0)),
  };
}

export async function getCashAccountStatementFromLedger(
  cashAccountId: number
): Promise<PartyStatementLine[]> {
  const db = await getDatabase();
  const ledgerAccount = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM ledger_accounts WHERE cash_account_id = ?`,
    [cashAccountId]
  );
  if (!ledgerAccount) return [];

  const rows = await db.getAllAsync<{
    id: number;
    entry_date: string;
    description: string;
    debit: number;
    credit: number;
    reference_type: string | null;
    reference_id: number | null;
  }>(
    `SELECT jl.id, je.entry_date, je.description, jl.debit, jl.credit,
            je.reference_type, je.reference_id
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.ledger_account_id = ?
     ORDER BY je.entry_date ASC, je.id ASC, jl.id ASC`,
    [ledgerAccount.id]
  );

  let balance = 0;
  return rows.map((row, index) => {
    balance = roundMoney(balance + row.debit - row.credit);
    return {
      id: String(row.id),
      date: row.entry_date,
      description: row.description,
      debit: roundMoney(row.debit),
      credit: roundMoney(row.credit),
      balance,
      reference_type: 'payment' as const,
      reference_id: row.reference_id ?? index,
    };
  });
}

export async function verifyLedgerBalance(): Promise<{
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  entryCount: number;
}> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total_debit: number; total_credit: number; entry_count: number }>(
    `SELECT COALESCE(SUM(jl.debit), 0) as total_debit,
            COALESCE(SUM(jl.credit), 0) as total_credit,
            COUNT(DISTINCT je.id) as entry_count
     FROM journal_entries je
     LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id`
  );
  const totalDebit = roundMoney(row?.total_debit ?? 0);
  const totalCredit = roundMoney(row?.total_credit ?? 0);
  const difference = roundMoney(Math.abs(totalDebit - totalCredit));
  return {
    balanced: difference < 0.02,
    totalDebit,
    totalCredit,
    difference,
    entryCount: row?.entry_count ?? 0,
  };
}

export async function getDayBookFromLedger(
  startDate: string,
  endDate: string
): Promise<PartyStatementLine[]> {
  const db = await getDatabase();
  const entries = await db.getAllAsync<{
    id: number;
    entry_date: string;
    description: string;
    reference_type: string | null;
    reference_id: number | null;
    total_debit: number;
    total_credit: number;
  }>(
    `SELECT je.id, je.entry_date, je.description, je.reference_type, je.reference_id,
            COALESCE(SUM(jl.debit), 0) as total_debit,
            COALESCE(SUM(jl.credit), 0) as total_credit
     FROM journal_entries je
     JOIN journal_lines jl ON jl.journal_entry_id = je.id
     WHERE je.entry_date >= ? AND je.entry_date <= ?
     GROUP BY je.id
     ORDER BY je.entry_date ASC, je.id ASC`,
    [startDate, endDate]
  );

  let balance = 0;
  return entries.map((entry) => {
    balance = roundMoney(balance + entry.total_debit - entry.total_credit);
    return {
      id: String(entry.id),
      date: entry.entry_date,
      description: entry.description,
      debit: roundMoney(entry.total_debit),
      credit: roundMoney(entry.total_credit),
      balance,
      reference_type: 'payment' as const,
      reference_id: entry.reference_id ?? entry.id,
    };
  });
}

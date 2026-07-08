import * as SQLite from 'expo-sqlite';
import { waitForDatabaseAccess } from '../services/dbMaintenance';
import { roundMoney } from '../utils/money';

export const DB_NAME = 'hisab.db';
const SCHEMA_VERSION = 22;

/** Removes the legacy attachment media folder left over from the removed attachments feature. */
async function clearLegacyMediaFolder(): Promise<void> {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const mediaRoot = `${FileSystem.documentDirectory}media`;
    const info = await FileSystem.getInfoAsync(mediaRoot);
    if (info.exists) {
      await FileSystem.deleteAsync(mediaRoot, { idempotent: true });
    }
  } catch {
    // Best-effort cleanup; ignore failures.
  }
}

/** Thrown when an existing database cannot be migrated to the current schema. */
export class SchemaMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaMigrationError';
  }
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let financialIntegrityRepaired = false;

function isLikelyCorruptDatabaseError(error: unknown): boolean {
  const msg = formatSqliteError(error).toLowerCase();
  return (
    msg.includes('corrupt') ||
    msg.includes('malformed') ||
    msg.includes('not a database') ||
    msg.includes('file is encrypted or is not a database')
  );
}

export async function invalidateDatabase(): Promise<void> {
  if (dbInstance) {
    try {
      await dbInstance.closeAsync();
    } catch {
      // Native handle may already be invalid after fast refresh
    }
  }
  dbInstance = null;
  initPromise = null;
  financialIntegrityRepaired = false;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  await waitForDatabaseAccess();

  if (dbInstance) {
    return dbInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      let db: SQLite.SQLiteDatabase | null = null;
      try {
        db = await SQLite.openDatabaseAsync(DB_NAME);
        await db.execAsync('PRAGMA foreign_keys = ON;');
        await initSchema(db);
        dbInstance = db;
        return db;
      } catch (error) {
        if (db) {
          try {
            await db.closeAsync();
          } catch {
            // ignore close errors during failed init
          }
        }
        dbInstance = null;

        if (isLikelyCorruptDatabaseError(error)) {
          throw new SchemaMigrationError(
            'Your database file appears damaged. Restore from a backup folder or file in Settings — do not reset unless you have no backup.'
          );
        }

        throw error;
      }
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

export async function resetDatabase(): Promise<void> {
  await invalidateDatabase();
  await clearLegacyMediaFolder();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await rebuildSchema(db);
  financialIntegrityRepaired = true;
  dbInstance = db;
  initPromise = Promise.resolve(db);
  const { pauseAutoBackupAfterReset } = await import('../services/backup');
  await pauseAutoBackupAfterReset();
}

/** True when the database has real user data (not just default empty accounts). */
export async function databaseHasUserData(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT (
        (SELECT COUNT(*) FROM sales) +
        (SELECT COUNT(*) FROM purchases) +
        (SELECT COUNT(*) FROM products) +
        (SELECT COUNT(*) FROM parties) +
        (SELECT COUNT(*) FROM expenses) +
        (SELECT COUNT(*) FROM other_income) +
        (SELECT COUNT(*) FROM fixed_assets) +
        (SELECT COUNT(*) FROM loans)
      ) AS total`
    );
    return (row?.total ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
  }
  dbInstance = null;
  initPromise = null;
}

/**
 * Fold all committed WAL data into the main database file. expo-sqlite opens
 * databases in WAL mode, so recent transactions can live in the `-wal` file and
 * be absent from `hisab.db`. Backups copy only `hisab.db`, so we must checkpoint
 * first or the backup will silently miss the latest changes. Best-effort.
 */
export async function checkpointDatabase(options?: { strict?: boolean }): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (error) {
    if (options?.strict) {
      // A failed checkpoint means the backup would silently miss the latest
      // transactions still sitting in the WAL file.
      throw new Error(
        `Could not flush recent changes before backup: ${formatSqliteError(error)}`
      );
    }
  }
}

export function formatSqliteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
      .replace(/^Call to function '(NativeDatabase\.\w+|ExpoSQLite\.\w+)' has been rejected\.\s*→ Caused by:\s*/i, '')
      .trim();
  }
  return 'Unknown database error';
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const version = await getSchemaVersion(db);

  if (version === 0) {
    // A missing schema_version marker on a database that still holds business
    // rows means the marker (or settings table) was lost/corrupted — never
    // rebuild, which drops every table and destroys the user's books.
    if (await hasUnversionedUserData(db)) {
      throw new SchemaMigrationError(
        'Your data could not be verified (missing version marker). Please restore from a backup in Settings — do not reset unless you have no backup.'
      );
    }
    await rebuildSchema(db);
    financialIntegrityRepaired = true;
    return;
  }

  if (version === SCHEMA_VERSION) {
    const validCurrent = await verifySchema(db);
    if (!validCurrent) {
      throw new SchemaMigrationError(
        'Your data could not be verified. Please restore from a backup in Settings.'
      );
    }
    await seedDefaultAccounts(db);
    await repairFinancialDataIntegrity(db, { force: true });
    return;
  }

  await runMigrations(db, version);

  const valid = (await getSchemaVersion(db)) === SCHEMA_VERSION && (await verifySchema(db));
  if (!valid) {
    // Never silently drop an existing database: that would destroy all user
    // data. Surface the failure so the user can restore from a backup instead.
    throw new SchemaMigrationError(
      'Your data could not be upgraded to the latest version. Please restore from a backup in Settings.'
    );
  }

  await seedDefaultAccounts(db);
  await repairFinancialDataIntegrity(db, { force: true });
}

async function runMigrations(db: SQLite.SQLiteDatabase, fromVersion: number): Promise<void> {
  // Do not wrap migrations in a single transaction: DDL (ALTER/CREATE INDEX) can
  // implicitly commit in SQLite, leaving expo-sqlite unable to roll back.
  await ensurePartiesColumns(db);
  await ensureInvoicePartyColumns(db);
  await ensureProductsSellPriceColumn(db);
  await ensureProductsUniqueName(db);
  await ensureProductCategories(db);
  await ensureAccountsExcludedColumn(db);
  await ensurePurchaseVendorColumns(db);
  await ensurePurchasesSubtotalDiscountColumns(db);
  await ensureOtherIncomeTable(db);
  await ensureSalesServiceChargesColumn(db);
  await ensureUniqueInvoiceNumbers(db);
  await ensureInvoiceNumberIndexes(db);
  await ensureTransactionsPaymentIdColumn(db);
  await ensureTransactionPaymentLinks(db);
  await dropAttachmentsTable(db);
  await ensureLoansTable(db);
  await ensureProductsIsHiddenColumn(db);
  await ensureProductsUniqueVisibleName(db);
  await ensureExpenseCategoriesTable(db);
  await ensureOtherIncomeCategoriesTable(db);
  await cleanupOrphanChildRows(db);
  await ensurePerformanceIndexes(db);

  if (fromVersion < SCHEMA_VERSION) {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)`,
      [String(SCHEMA_VERSION)]
    );
  }
}

/**
 * Link payment-backed ledger rows to their exact sale/purchase payment row so
 * deleting a transaction removes the right payment even when two payments
 * share account, amount, and date.
 */
async function ensureTransactionsPaymentIdColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('payment_id')) {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN payment_id INTEGER');
  }
}

/** Backfill payment_id on legacy sale/purchase payment transactions when unambiguous. */
async function ensureTransactionPaymentLinks(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'`
  );
  if (!table) return;

  await db.execAsync(`
    UPDATE transactions
    SET payment_id = (
      SELECT sp.id FROM sale_payments sp
      WHERE sp.sale_id = transactions.reference_id
        AND sp.account_id = transactions.account_id
        AND sp.amount = transactions.amount
        AND sp.date = transactions.date
      LIMIT 1
    )
    WHERE type = 'sale_payment'
      AND reference_type = 'sale'
      AND reference_id IS NOT NULL
      AND payment_id IS NULL
      AND (
        SELECT COUNT(*) FROM sale_payments sp
        WHERE sp.sale_id = transactions.reference_id
          AND sp.account_id = transactions.account_id
          AND sp.amount = transactions.amount
          AND sp.date = transactions.date
      ) = 1;

    UPDATE transactions
    SET payment_id = (
      SELECT pp.id FROM purchase_payments pp
      WHERE pp.purchase_id = transactions.reference_id
        AND pp.account_id = transactions.account_id
        AND pp.amount = ABS(transactions.amount)
        AND pp.date = transactions.date
      LIMIT 1
    )
    WHERE type = 'purchase_payment'
      AND reference_type = 'purchase'
      AND reference_id IS NOT NULL
      AND payment_id IS NULL
      AND (
        SELECT COUNT(*) FROM purchase_payments pp
        WHERE pp.purchase_id = transactions.reference_id
          AND pp.account_id = transactions.account_id
          AND pp.amount = ABS(transactions.amount)
          AND pp.date = transactions.date
      ) = 1;
  `);
}

async function ensurePartiesColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='parties'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(parties)');
  const names = new Set(columns.map((col) => col.name));

  if (!names.has('phone')) {
    await db.execAsync('ALTER TABLE parties ADD COLUMN phone TEXT');
  }
  if (!names.has('notes')) {
    await db.execAsync('ALTER TABLE parties ADD COLUMN notes TEXT');
  }
}

async function ensureInvoicePartyColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const parties = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='parties'`
  );
  if (!parties) return;

  const sales = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='sales'`
  );
  if (sales) {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sales)');
    const names = new Set(columns.map((col) => col.name));
    if (!names.has('party_id')) {
      await db.execAsync('ALTER TABLE sales ADD COLUMN party_id INTEGER');
    }
    await db.execAsync(`
      INSERT OR IGNORE INTO parties (name, type)
      SELECT DISTINCT party_name, 'customer' FROM sales
      WHERE party_name IS NOT NULL AND TRIM(party_name) != ''
    `);
    await db.execAsync(`
      UPDATE sales
      SET party_id = (
        SELECT p.id FROM parties p
        WHERE p.type = 'customer' AND p.name = sales.party_name COLLATE NOCASE
        LIMIT 1
      )
      WHERE party_id IS NULL
    `);
  }

  const purchases = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='purchases'`
  );
  if (purchases) {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(purchases)');
    const names = new Set(columns.map((col) => col.name));
    if (!names.has('party_id')) {
      await db.execAsync('ALTER TABLE purchases ADD COLUMN party_id INTEGER');
    }
    await db.execAsync(`
      INSERT OR IGNORE INTO parties (name, type)
      SELECT DISTINCT supplier_name, 'vendor' FROM purchases
      WHERE supplier_name IS NOT NULL AND TRIM(supplier_name) != ''
    `);
    await db.execAsync(`
      UPDATE purchases
      SET party_id = (
        SELECT p.id FROM parties p
        WHERE p.type = 'vendor' AND p.name = purchases.supplier_name COLLATE NOCASE
        LIMIT 1
      )
      WHERE party_id IS NULL
    `);
  }
}

async function ensureProductsIsHiddenColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='products'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('is_hidden')) {
    await db.execAsync(
      'ALTER TABLE products ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0'
    );
  }
}

/** Unique product names among active (non-hidden) inventory items only. */
async function ensureProductsUniqueVisibleName(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='products'`
  );
  if (!table) return;

  // Always remove the legacy all-rows unique index. It blocks re-adding a
  // product whose name matches a soft-deleted (hidden) one; visible-only
  // uniqueness is enforced by the partial index below.
  await db.execAsync('DROP INDEX IF EXISTS idx_products_name_unique');

  const partialIndex = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_name_visible_unique'`
  );
  if (partialIndex) return;

  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_visible_unique
     ON products(name COLLATE NOCASE) WHERE COALESCE(is_hidden, 0) = 0`
  );
}

async function ensureProductsUniqueName(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='products'`
  );
  if (!table) return;

  // Once soft-delete (is_hidden) exists, uniqueness is governed by the partial
  // index on visible rows only. Never (re)create the legacy all-rows index, or
  // it would block re-adding a product whose name matches a hidden one.
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
  if (columns.some((col) => col.name === 'is_hidden')) return;

  const index = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_name_unique'`
  );
  if (index) return;

  const dupes = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM products GROUP BY name COLLATE NOCASE HAVING COUNT(*) > 1`
  );
  for (const dupe of dupes) {
    const products = await db.getAllAsync<{ id: number; name: string }>(
      `SELECT id, name FROM products WHERE name = ? COLLATE NOCASE ORDER BY id`,
      [dupe.name]
    );
    for (let i = 1; i < products.length; i++) {
      await db.runAsync('UPDATE products SET name = ? WHERE id = ?', [
        `${products[i].name} (${products[i].id})`,
        products[i].id,
      ]);
    }
  }

  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique ON products(name COLLATE NOCASE)'
  );
}

async function ensureProductCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  const categoriesTable = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='product_categories'`
  );
  if (!categoriesTable) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  const productsTable = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='products'`
  );
  if (!productsTable) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('category')) {
    await db.execAsync('ALTER TABLE products ADD COLUMN category TEXT');
  }
}

async function ensureExpenseCategoriesTable(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='expense_categories'`
  );
  if (!table) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const expenses = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'`
    );
    if (expenses) {
      await db.execAsync(`
        INSERT OR IGNORE INTO expense_categories (name)
        SELECT DISTINCT category FROM expenses
        WHERE category IS NOT NULL AND TRIM(category) != ''
      `);
    }
  }
}

async function ensureOtherIncomeCategoriesTable(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='other_income_categories'`
  );
  if (!table) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS other_income_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const otherIncome = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='other_income'`
    );
    if (otherIncome) {
      await db.execAsync(`
        INSERT OR IGNORE INTO other_income_categories (name)
        SELECT DISTINCT category FROM other_income
        WHERE category IS NOT NULL AND TRIM(category) != ''
      `);
    }
  }
}

async function ensureAccountsExcludedColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(accounts)');
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('is_excluded')) {
    await db.execAsync('ALTER TABLE accounts ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0');
  }
}

async function ensurePurchaseVendorColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='purchases'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(purchases)');
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('vendor_invoice_no')) {
    await db.execAsync('ALTER TABLE purchases ADD COLUMN vendor_invoice_no TEXT');
  }
}

async function ensurePurchasesSubtotalDiscountColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='purchases'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(purchases)');
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('subtotal')) {
    await db.execAsync('ALTER TABLE purchases ADD COLUMN subtotal REAL NOT NULL DEFAULT 0');
  }
  if (!names.has('discount_amount')) {
    await db.execAsync('ALTER TABLE purchases ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0');
  }

  await db.execAsync(`
    UPDATE purchases SET subtotal = (
      SELECT COALESCE(SUM(total), 0) FROM purchase_items WHERE purchase_id = purchases.id
    )
    WHERE subtotal = 0
      AND EXISTS (SELECT 1 FROM purchase_items WHERE purchase_id = purchases.id)
  `);
  await db.execAsync(`
    UPDATE purchases SET discount_amount = MAX(0, subtotal - total_amount)
    WHERE discount_amount = 0 AND subtotal > total_amount + 0.001
  `);
}

/** Allow duplicate invoice numbers — drop legacy unique indexes; keep search indexes. */
async function ensureInvoiceNumberIndexes(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('DROP INDEX IF EXISTS idx_sales_invoice_no_unique');
  await db.execAsync('DROP INDEX IF EXISTS idx_purchases_invoice_no_unique');

  for (const table of ['sales', 'purchases'] as const) {
    const exists = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [table]
    );
    if (!exists) continue;

    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_${table}_invoice_no ON ${table}(invoice_no)`
    );
  }
}

/** Legacy cleanup: invoice numbers are allowed to duplicate, so remove old unique indexes. */
async function ensureUniqueInvoiceNumbers(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('DROP INDEX IF EXISTS idx_sales_invoice_no_unique');
  await db.execAsync('DROP INDEX IF EXISTS idx_purchases_invoice_no_unique');
}

/** Drops the legacy attachments table and its media folder (attachments feature removed). */
async function dropAttachmentsTable(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'`
  );
  if (!table) return;

  await db.execAsync(`
    DROP INDEX IF EXISTS idx_attachments_ref;
    DROP TABLE IF EXISTS attachments;
  `);
  await clearLegacyMediaFolder();
}

async function ensureLoansTable(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='loans'`
  );
  if (table) return;

  await db.execAsync(`
    CREATE TABLE loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lender_name TEXT NOT NULL,
      principal_amount REAL NOT NULL DEFAULT 0,
      outstanding_amount REAL NOT NULL DEFAULT 0,
      interest_rate REAL,
      start_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function ensurePerformanceIndexes(db: SQLite.SQLiteDatabase): Promise<void> {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)',
    'CREATE INDEX IF NOT EXISTS idx_sales_party ON sales(party_name)',
    'CREATE INDEX IF NOT EXISTS idx_sales_party_id ON sales(party_id)',
    'CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)',
    'CREATE INDEX IF NOT EXISTS idx_sales_date_created ON sales(date, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date)',
    'CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_name)',
    'CREATE INDEX IF NOT EXISTS idx_purchases_party_id ON purchases(party_id)',
    'CREATE INDEX IF NOT EXISTS idx_purchases_date_created ON purchases(date, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_date_created ON expenses(date, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_other_income_date ON other_income(date)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_payments_date ON purchase_payments(date)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id)',
  ];

  for (const sql of indexes) {
    await db.execAsync(sql);
  }
}

async function ensureSalesServiceChargesColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='sales'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sales)');
  const names = new Set(columns.map((col) => col.name));
  if (!names.has('service_charges')) {
    await db.execAsync(
      'ALTER TABLE sales ADD COLUMN service_charges REAL NOT NULL DEFAULT 0'
    );
  }
}

async function ensureOtherIncomeTable(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='other_income'`
  );
  if (table) return;

  await db.execAsync(`
    CREATE TABLE other_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);
}

async function ensureProductsSellPriceColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='products'`
  );
  if (!table) return;

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
  const names = new Set(columns.map((col) => col.name));

  if (!names.has('sell_price')) {
    await db.execAsync('ALTER TABLE products ADD COLUMN sell_price REAL NOT NULL DEFAULT 0');
    await db.execAsync(
      'UPDATE products SET sell_price = ROUND(avg_cost * 1.2, 2) WHERE sell_price = 0 AND avg_cost > 0'
    );
  }
}

/**
 * Earlier releases deleted sales/purchases while foreign keys were OFF, so
 * CASCADE never fired and orphan child rows were left behind. Sweep them out.
 */
async function repairSaleItemUnitCosts(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    UPDATE sale_items
    SET unit_cost = (
      SELECT ABS(im.unit_cost)
      FROM inventory_movements im
      WHERE im.reference_type = 'sale'
        AND im.reference_id = sale_items.sale_id
        AND im.product_id = sale_items.product_id
        AND im.type = 'sale'
        AND im.unit_cost != 0
      LIMIT 1
    )
    WHERE unit_cost = 0
      AND EXISTS (
        SELECT 1 FROM inventory_movements im
        WHERE im.reference_type = 'sale'
          AND im.reference_id = sale_items.sale_id
          AND im.product_id = sale_items.product_id
          AND im.type = 'sale'
          AND im.unit_cost != 0
      )
  `);
}

async function cleanupOrphanInvoiceHeaders(db: SQLite.SQLiteDatabase): Promise<void> {
  const orphanSales = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM sales WHERE id NOT IN (SELECT DISTINCT sale_id FROM sale_items)`
  );
  for (const { id } of orphanSales) {
    const productIds = await db.getAllAsync<{ product_id: number }>(
      `SELECT DISTINCT product_id FROM inventory_movements
       WHERE reference_type = 'sale' AND reference_id = ?`,
      [id]
    );
    await db.runAsync(
      `DELETE FROM inventory_movements WHERE reference_type = 'sale' AND reference_id = ?`,
      [id]
    );
    await reverseTransactionsByReference(db, 'sale', id);
    await db.runAsync('DELETE FROM sale_payments WHERE sale_id = ?', [id]);
    await db.runAsync('DELETE FROM sales WHERE id = ?', [id]);
    for (const { product_id } of productIds) {
      await recomputeProductStock(db, product_id);
    }
  }

  const orphanPurchases = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM purchases WHERE id NOT IN (SELECT DISTINCT purchase_id FROM purchase_items)`
  );
  for (const { id } of orphanPurchases) {
    const productIds = await db.getAllAsync<{ product_id: number }>(
      `SELECT DISTINCT product_id FROM inventory_movements
       WHERE reference_type = 'purchase' AND reference_id = ?`,
      [id]
    );
    await db.runAsync(
      `DELETE FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id = ?`,
      [id]
    );
    await reverseTransactionsByReference(db, 'purchase', id);
    await db.runAsync('DELETE FROM purchase_payments WHERE purchase_id = ?', [id]);
    await db.runAsync('DELETE FROM purchases WHERE id = ?', [id]);
    for (const { product_id } of productIds) {
      await recomputeProductStock(db, product_id);
    }
  }
}

async function cleanupOrphanChildRows(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const statements = [
    `DELETE FROM sale_items WHERE sale_id NOT IN (SELECT id FROM sales)`,
    `DELETE FROM sale_payments WHERE sale_id NOT IN (SELECT id FROM sales)`,
    `DELETE FROM purchase_items WHERE purchase_id NOT IN (SELECT id FROM purchases)`,
    `DELETE FROM purchase_payments WHERE purchase_id NOT IN (SELECT id FROM purchases)`,
    `DELETE FROM inventory_movements WHERE reference_type = 'sale' AND reference_id NOT IN (SELECT id FROM sales)`,
    `DELETE FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id NOT IN (SELECT id FROM purchases)`,
  ];
  for (const sql of statements) {
    try {
      await db.execAsync(sql);
    } catch {
      // Table may not exist yet on very old schemas; other migrations create it.
    }
  }

    await repairSaleItemUnitCosts(db);
    await cleanupOrphanInvoiceHeaders(db);
  } catch {
    // Best-effort housekeeping during migration; must not block app startup.
  }
}

/** Fix stale sale costs and remove invoice headers left behind by old deletes. */
export async function repairFinancialDataIntegrity(
  db?: SQLite.SQLiteDatabase,
  options?: { force?: boolean }
): Promise<void> {
  if (financialIntegrityRepaired && !options?.force) return;
  const database = db ?? (await getDatabase());
  await cleanupOrphanTransactions(database);
  await repairSaleItemUnitCosts(database);
  await cleanupOrphanInvoiceHeaders(database);
  financialIntegrityRepaired = true;
}

async function cleanupOrphanTransactions(db: SQLite.SQLiteDatabase): Promise<void> {
  const references: [string, string][] = [
    ['sale', 'sales'],
    ['purchase', 'purchases'],
    ['expense', 'expenses'],
    ['other_income', 'other_income'],
  ];
  for (const [refType, table] of references) {
    try {
      // Reverse each orphan's effect on the account balance before deleting,
      // or cash/bank balances permanently drift from the transaction ledger.
      const orphans = await db.getAllAsync<{ id: number; account_id: number; amount: number }>(
        `SELECT id, account_id, amount FROM transactions
         WHERE reference_type = ? AND reference_id IS NOT NULL
           AND reference_id NOT IN (SELECT id FROM ${table})`,
        [refType]
      );
      for (const tx of orphans) {
        await updateAccountBalance(db, tx.account_id, -tx.amount);
        await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
      }
    } catch {
      // Table may not exist on very old schemas.
    }
  }
}

/** True when core business tables exist and contain rows despite the schema_version marker being absent. */
async function hasUnversionedUserData(db: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table'
       AND name IN ('sales', 'purchases', 'products', 'parties', 'expenses', 'transactions')`
    );
    for (const { name } of tables) {
      const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM "${name}"`);
      if ((row?.c ?? 0) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function getSchemaVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='settings'`
    );
    if (tables.length === 0) return 0;

    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'schema_version'`
    );
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

async function verifySchema(db: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    await db.getFirstAsync('SELECT opening_balance, current_balance, is_excluded FROM accounts LIMIT 1');
    await db.getFirstAsync(
      'SELECT opening_qty, opening_cost, avg_cost, sell_price, current_qty, category, is_hidden FROM products LIMIT 1'
    );
    await db.getFirstAsync(
      'SELECT paid_amount, status, discount_amount, service_charges FROM sales LIMIT 1'
    );
    await db.getFirstAsync(
      'SELECT paid_amount, status, vendor_invoice_no, subtotal, discount_amount FROM purchases LIMIT 1'
    );
    await db.getFirstAsync('SELECT unit_cost FROM inventory_movements LIMIT 1');
    await db.getFirstAsync('SELECT type, amount, payment_id FROM transactions LIMIT 1');
    await db.getFirstAsync('SELECT is_recurring FROM expenses LIMIT 1');
    await db.getFirstAsync('SELECT category, amount FROM other_income LIMIT 1');
    await db.getFirstAsync('SELECT value FROM fixed_assets LIMIT 1');
    await db.getFirstAsync('SELECT lender_name, outstanding_amount FROM loans LIMIT 1');
    await db.getFirstAsync('SELECT name, type, phone, notes FROM parties LIMIT 1');
    await db.getFirstAsync('SELECT name FROM product_categories LIMIT 1');
    await db.getFirstAsync('SELECT name FROM expense_categories LIMIT 1');
    await db.getFirstAsync('SELECT name FROM other_income_categories LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

async function rebuildSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  // foreign_keys cannot change inside a transaction, so toggle it outside.
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  await db.execAsync(`
    DROP TABLE IF EXISTS attachments;
    DROP TABLE IF EXISTS sale_payments;
    DROP TABLE IF EXISTS sale_items;
    DROP TABLE IF EXISTS sales;
    DROP TABLE IF EXISTS purchase_payments;
    DROP TABLE IF EXISTS purchase_items;
    DROP TABLE IF EXISTS purchases;
    DROP TABLE IF EXISTS inventory_movements;
    DROP TABLE IF EXISTS product_categories;
    DROP TABLE IF EXISTS expense_categories;
    DROP TABLE IF EXISTS other_income_categories;
    DROP TABLE IF EXISTS expenses;
    DROP TABLE IF EXISTS other_income;
    DROP TABLE IF EXISTS fixed_assets;
    DROP TABLE IF EXISTS loans;
    DROP TABLE IF EXISTS parties;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS settings;
  `);
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await createTables(db);
  await seedDefaultAccounts(db);
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)`, [
    String(SCHEMA_VERSION),
  ]);
}

async function createTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'cash',
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      is_excluded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE other_income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      unit TEXT NOT NULL DEFAULT 'pcs',
      opening_qty REAL NOT NULL DEFAULT 0,
      opening_cost REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      current_qty REAL NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      type TEXT NOT NULL CHECK(type IN ('customer', 'vendor')),
      phone TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, type)
    );

    CREATE TABLE fixed_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lender_name TEXT NOT NULL,
      principal_amount REAL NOT NULL DEFAULT 0,
      outstanding_amount REAL NOT NULL DEFAULT 0,
      interest_rate REAL,
      start_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL,
      party_id INTEGER,
      party_name TEXT NOT NULL,
      date TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      service_charges REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (party_id) REFERENCES parties(id)
    );

    CREATE TABLE sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL,
      party_id INTEGER,
      supplier_name TEXT NOT NULL,
      vendor_invoice_no TEXT,
      date TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (party_id) REFERENCES parties(id)
    );

    CREATE TABLE purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      qty REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE purchase_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE other_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      payment_id INTEGER,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE UNIQUE INDEX idx_products_name_visible_unique
      ON products(name COLLATE NOCASE) WHERE COALESCE(is_hidden, 0) = 0;
    CREATE INDEX idx_sales_invoice_no ON sales(invoice_no);
    CREATE INDEX idx_purchases_invoice_no ON purchases(invoice_no);

    CREATE INDEX idx_sales_date ON sales(date);
    CREATE INDEX idx_sales_party ON sales(party_name);
    CREATE INDEX idx_sales_status ON sales(status);
    CREATE INDEX idx_purchases_date ON purchases(date);
    CREATE INDEX idx_purchases_supplier ON purchases(supplier_name);
    CREATE INDEX idx_expenses_date ON expenses(date);
    CREATE INDEX idx_other_income_date ON other_income(date);
    CREATE INDEX idx_purchase_payments_date ON purchase_payments(date);
    CREATE INDEX idx_transactions_account_date ON transactions(account_id, date);
    CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
  `);
}

async function seedDefaultAccounts(db: SQLite.SQLiteDatabase): Promise<void> {
  const accountCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts'
  );
  if ((accountCount?.count ?? 0) === 0) {
    await db.runAsync(
      `INSERT INTO accounts (name, type, opening_balance, current_balance, is_excluded) VALUES (?, ?, ?, ?, ?)`,
      ['Cash', 'cash', 0, 0, 0]
    );
    await db.runAsync(
      `INSERT INTO accounts (name, type, opening_balance, current_balance, is_excluded) VALUES (?, ?, ?, ?, ?)`,
      ['Bank', 'bank', 0, 0, 0]
    );
  }
}

export function getPaymentStatus(total: number, paid: number): 'paid' | 'partial' | 'unpaid' {
  const t = roundMoney(total);
  const p = roundMoney(paid);
  // A zero-total invoice with no payment recorded should read as unpaid,
  // not silently "paid" via the rounding tolerance.
  if (t <= 0) return p > 0 ? 'paid' : 'unpaid';
  if (p >= t - 0.01) return 'paid';
  if (p > 0) return 'partial';
  return 'unpaid';
}

export async function updateAccountBalance(
  db: SQLite.SQLiteDatabase,
  accountId: number,
  delta: number
): Promise<void> {
  await db.runAsync(
    'UPDATE accounts SET current_balance = ROUND(current_balance + ?, 2) WHERE id = ?',
    [roundMoney(delta), accountId]
  );
}

/** Reverse ledger entries for a reference and remove them — avoids double-adjusting balances. */
export async function reverseTransactionsByReference(
  db: SQLite.SQLiteDatabase,
  referenceType: string,
  referenceId: number
): Promise<void> {
  const txs = await db.getAllAsync<{ id: number; account_id: number; amount: number }>(
    'SELECT id, account_id, amount FROM transactions WHERE reference_type = ? AND reference_id = ?',
    [referenceType, referenceId]
  );
  for (const tx of txs) {
    await updateAccountBalance(db, tx.account_id, -tx.amount);
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [tx.id]);
  }
}

export async function recordTransaction(
  db: SQLite.SQLiteDatabase,
  params: {
    account_id: number;
    type: string;
    amount: number;
    reference_type?: string | null;
    reference_id?: number | null;
    payment_id?: number | null;
    description: string;
    date: string;
  }
): Promise<number> {
  if (!params.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }

  const amount = roundMoney(params.amount);
  const result = await db.runAsync(
    `INSERT INTO transactions (account_id, type, amount, reference_type, reference_id, payment_id, description, date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.account_id,
      params.type,
      amount,
      params.reference_type ?? null,
      params.reference_id ?? null,
      params.payment_id ?? null,
      params.description,
      params.date,
    ]
  );
  await updateAccountBalance(db, params.account_id, amount);
  return result.lastInsertRowId;
}

export async function updateWeightedAvgCost(
  db: SQLite.SQLiteDatabase,
  productId: number,
  purchaseQty: number,
  purchaseCost: number
): Promise<void> {
  const product = await db.getFirstAsync<{ current_qty: number; avg_cost: number }>(
    'SELECT current_qty, avg_cost FROM products WHERE id = ?',
    [productId]
  );
  if (!product) return;

  const newQty = roundMoney(product.current_qty + purchaseQty);
  const newAvg =
    newQty > 0
      ? roundMoney(
          (product.current_qty * product.avg_cost + purchaseQty * purchaseCost) / newQty
        )
      : roundMoney(purchaseCost);

  await db.runAsync(
    'UPDATE products SET current_qty = ?, avg_cost = ? WHERE id = ?',
    [newQty, newAvg, productId]
  );
}

/**
 * Recompute a product's current stock and weighted-average cost from its full
 * movement history, rather than incrementally reversing a single line. This is
 * exact regardless of the order of purchases/sales/adjustments.
 *
 * - Average cost basis = weighted average of all cost-bearing inflows
 *   (`opening` and `purchase` movements).
 * - Current quantity = signed sum of every movement.
 */
export async function recomputeProductStock(
  db: SQLite.SQLiteDatabase,
  productId: number
): Promise<{ currentQty: number; avgCost: number }> {
  const inflow = await db.getFirstAsync<{ qty: number; cost: number }>(
    `SELECT COALESCE(SUM(qty), 0) as qty, COALESCE(SUM(qty * unit_cost), 0) as cost
     FROM inventory_movements
     WHERE product_id = ? AND type IN ('opening', 'purchase')`,
    [productId]
  );
  const all = await db.getFirstAsync<{ qty: number }>(
    `SELECT COALESCE(SUM(qty), 0) as qty FROM inventory_movements WHERE product_id = ?`,
    [productId]
  );

  const inflowQty = inflow?.qty ?? 0;
  const avgCost = inflowQty > 0 ? roundMoney((inflow?.cost ?? 0) / inflowQty) : 0;
  const currentQty = roundMoney(all?.qty ?? 0);

  await db.runAsync('UPDATE products SET current_qty = ?, avg_cost = ? WHERE id = ?', [
    currentQty,
    Math.max(0, avgCost),
    productId,
  ]);

  return { currentQty, avgCost: Math.max(0, avgCost) };
}

export async function reduceInventory(
  db: SQLite.SQLiteDatabase,
  productId: number,
  qty: number
): Promise<number> {
  const product = await db.getFirstAsync<{ current_qty: number; avg_cost: number; name: string }>(
    'SELECT current_qty, avg_cost, name FROM products WHERE id = ?',
    [productId]
  );
  if (!product) throw new Error('Product not found');
  if (roundMoney(product.current_qty) < roundMoney(qty)) {
    throw new Error(`Insufficient stock for ${product.name} (${product.current_qty} available)`);
  }

  let unitCost = product.avg_cost;
  if (unitCost <= 0) {
    const recomputed = await recomputeProductStock(db, productId);
    unitCost = recomputed.avgCost;
  }

  await db.runAsync('UPDATE products SET current_qty = ROUND(current_qty - ?, 2) WHERE id = ?', [
    roundMoney(qty),
    productId,
  ]);
  return unitCost;
}

export async function generateInvoiceNo(
  db: SQLite.SQLiteDatabase,
  prefix: 'S' | 'P',
  saleOrPurchaseId: number
): Promise<string> {
  return `${prefix}-${String(saleOrPurchaseId).padStart(4, '0')}`;
}

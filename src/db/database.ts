import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'hisab.db';
const SCHEMA_VERSION = 6;

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await initSchema(db);
      dbInstance = db;
      return db;
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

export async function resetDatabase(): Promise<void> {
  if (initPromise) {
    try {
      await initPromise;
    } catch {
      initPromise = null;
      dbInstance = null;
    }
  }

  const db = dbInstance ?? (await SQLite.openDatabaseAsync(DB_NAME));
  await rebuildSchema(db);
  dbInstance = db;
  initPromise = Promise.resolve(db);
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
  }
  dbInstance = null;
  initPromise = null;
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
    await rebuildSchema(db);
    return;
  }

  await runMigrations(db, version);

  const valid = (await getSchemaVersion(db)) === SCHEMA_VERSION && (await verifySchema(db));
  if (!valid) {
    await rebuildSchema(db);
    return;
  }

  await seedDefaultAccounts(db);
}

async function runMigrations(db: SQLite.SQLiteDatabase, fromVersion: number): Promise<void> {
  await ensurePartiesColumns(db);
  await ensureProductsSellPriceColumn(db);

  if (fromVersion < SCHEMA_VERSION) {
    await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)`, [
      String(SCHEMA_VERSION),
    ]);
  }
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
    await db.getFirstAsync('SELECT opening_balance, current_balance FROM accounts LIMIT 1');
    await db.getFirstAsync(
      'SELECT opening_qty, opening_cost, avg_cost, sell_price, current_qty FROM products LIMIT 1'
    );
    await db.getFirstAsync('SELECT paid_amount, status, discount_amount FROM sales LIMIT 1');
    await db.getFirstAsync('SELECT paid_amount, status FROM purchases LIMIT 1');
    await db.getFirstAsync('SELECT unit_cost FROM inventory_movements LIMIT 1');
    await db.getFirstAsync('SELECT type, amount FROM transactions LIMIT 1');
    await db.getFirstAsync('SELECT is_recurring FROM expenses LIMIT 1');
    await db.getFirstAsync('SELECT value FROM fixed_assets LIMIT 1');
    await db.getFirstAsync('SELECT name, type, phone, notes FROM parties LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

async function rebuildSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS sale_payments;
      DROP TABLE IF EXISTS sale_items;
      DROP TABLE IF EXISTS sales;
      DROP TABLE IF EXISTS purchase_payments;
      DROP TABLE IF EXISTS purchase_items;
      DROP TABLE IF EXISTS purchases;
      DROP TABLE IF EXISTS inventory_movements;
      DROP TABLE IF EXISTS expenses;
      DROP TABLE IF EXISTS fixed_assets;
      DROP TABLE IF EXISTS parties;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS transactions;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS accounts;
      DROP TABLE IF EXISTS settings;
      PRAGMA foreign_keys = ON;
    `);
  });

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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT,
      unit TEXT NOT NULL DEFAULT 'pcs',
      opening_qty REAL NOT NULL DEFAULT 0,
      opening_cost REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      current_qty REAL NOT NULL DEFAULT 0,
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

    CREATE TABLE sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL,
      party_name TEXT NOT NULL,
      date TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      supplier_name TEXT NOT NULL,
      date TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

async function seedDefaultAccounts(db: SQLite.SQLiteDatabase): Promise<void> {
  const accountCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts'
  );
  if ((accountCount?.count ?? 0) === 0) {
    await db.runAsync(
      `INSERT INTO accounts (name, type, opening_balance, current_balance) VALUES (?, ?, ?, ?)`,
      ['Cash', 'cash', 0, 0]
    );
    await db.runAsync(
      `INSERT INTO accounts (name, type, opening_balance, current_balance) VALUES (?, ?, ?, ?)`,
      ['Bank', 'bank', 0, 0]
    );
  }
}

export function getPaymentStatus(total: number, paid: number): 'paid' | 'partial' | 'unpaid' {
  if (paid >= total - 0.01) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

export async function updateAccountBalance(
  db: SQLite.SQLiteDatabase,
  accountId: number,
  delta: number
): Promise<void> {
  await db.runAsync(
    'UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?',
    [delta, accountId]
  );
}

export async function recordTransaction(
  db: SQLite.SQLiteDatabase,
  params: {
    account_id: number;
    type: string;
    amount: number;
    reference_type?: string | null;
    reference_id?: number | null;
    description: string;
    date: string;
  }
): Promise<void> {
  if (!params.account_id) {
    throw new Error('Please select a valid bank/cash account');
  }

  await db.runAsync(
    `INSERT INTO transactions (account_id, type, amount, reference_type, reference_id, description, date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.account_id,
      params.type,
      params.amount,
      params.reference_type ?? null,
      params.reference_id ?? null,
      params.description,
      params.date,
    ]
  );
  await updateAccountBalance(db, params.account_id, params.amount);
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

  const newQty = product.current_qty + purchaseQty;
  const newAvg =
    newQty > 0
      ? (product.current_qty * product.avg_cost + purchaseQty * purchaseCost) / newQty
      : purchaseCost;

  await db.runAsync(
    'UPDATE products SET current_qty = ?, avg_cost = ? WHERE id = ?',
    [newQty, newAvg, productId]
  );
}

export async function reduceInventory(
  db: SQLite.SQLiteDatabase,
  productId: number,
  qty: number
): Promise<number> {
  const product = await db.getFirstAsync<{ current_qty: number; avg_cost: number }>(
    'SELECT current_qty, avg_cost FROM products WHERE id = ?',
    [productId]
  );
  if (!product) throw new Error('Product not found');
  if (product.current_qty < qty) throw new Error('Insufficient stock');

  await db.runAsync('UPDATE products SET current_qty = current_qty - ? WHERE id = ?', [
    qty,
    productId,
  ]);
  return product.avg_cost;
}

export async function generateInvoiceNo(
  db: SQLite.SQLiteDatabase,
  prefix: string
): Promise<string> {
  const table = prefix === 'S' ? 'sales' : 'purchases';
  const row = await db.getFirstAsync<{ max_id: number }>(
    `SELECT COALESCE(MAX(id), 0) as max_id FROM ${table}`
  );
  const num = (row?.max_id ?? 0) + 1;
  return `${prefix}-${String(num).padStart(5, '0')}`;
}

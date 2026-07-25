import { openDatabaseAsync } from '../../testing/betterSqliteAdapter';
import { getDatabase } from '../../db/database';
import {
  getNextBosInvoiceNo,
  getNextPurchaseInvoiceNo,
  getNextSaleInvoiceNo,
} from '../invoiceNumbers';
import {
  setBosInvoicePrefix,
  setPurchaseInvoicePrefix,
  setSaleInvoicePrefix,
} from '../appSettings';

jest.mock('../../db/database', () => {
  const actual = jest.requireActual('../../db/database') as typeof import('../../db/database');
  return {
    ...actual,
    getDatabase: jest.fn(),
  };
});

const getDatabaseMock = getDatabase as jest.MockedFunction<typeof getDatabase>;

async function setupDb() {
  const db = await openDatabaseAsync(`invoice-seq-${Date.now()}-${Math.random()}`);
  await db.execAsync(`
    CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      invoice_type TEXT NOT NULL DEFAULT 'invoice'
    );
    CREATE TABLE purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE
    );
  `);
  getDatabaseMock.mockResolvedValue(db as unknown as Awaited<ReturnType<typeof getDatabase>>);
  return db;
}

describe('invoice sequence SQL max', () => {
  beforeEach(() => {
    getDatabaseMock.mockReset();
  });

  it('uses max numeric suffix for the stem and ignores other stems', async () => {
    const db = await setupDb();
    await setSaleInvoicePrefix('BPH2627-0001');
    await db.runAsync(`INSERT INTO sales (invoice_no, invoice_type) VALUES (?, ?)`, [
      'BPH2627-0009',
      'invoice',
    ]);
    await db.runAsync(`INSERT INTO sales (invoice_no, invoice_type) VALUES (?, ?)`, [
      'OTHER-9999',
      'invoice',
    ]);
    await db.runAsync(`INSERT INTO sales (invoice_no, invoice_type) VALUES (?, ?)`, [
      'BPH2627-0005',
      'bos',
    ]);

    await expect(getNextSaleInvoiceNo()).resolves.toBe('BPH2627-0010');
  });

  it('scopes purchase sequences independently', async () => {
    const db = await setupDb();
    await setPurchaseInvoicePrefix('P-0001');
    await db.runAsync(`INSERT INTO purchases (invoice_no) VALUES (?)`, ['P-0042']);
    await expect(getNextPurchaseInvoiceNo()).resolves.toBe('P-0043');
  });

  it('ignores BOS rows when allocating tax-invoice numbers', async () => {
    await setupDb();
    await setBosInvoicePrefix('BOS-0001');
    await setSaleInvoicePrefix('S-0001');
    const db = await getDatabaseMock();
    await db.runAsync(`INSERT INTO sales (invoice_no, invoice_type) VALUES (?, ?)`, [
      'BOS-0099',
      'bos',
    ]);

    await expect(getNextSaleInvoiceNo()).resolves.toBe('S-0001');
    await expect(getNextBosInvoiceNo()).resolves.toBe('BOS-0100');
  });
});

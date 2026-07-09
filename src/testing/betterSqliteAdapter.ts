import Database from 'better-sqlite3';

export type ExpoSqliteDatabase = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  withTransactionAsync: (fn: () => Promise<void>) => Promise<void>;
  closeAsync: () => Promise<void>;
};

const databases = new Map<string, Database.Database>();

function wrap(native: Database.Database, name: string): ExpoSqliteDatabase {
  return {
    async execAsync(sql: string) {
      native.exec(sql);
    },
    async runAsync(sql: string, params: unknown[] = []) {
      const info = native.prepare(sql).run(...params);
      const rowidRow = native.prepare('SELECT last_insert_rowid() AS id').get() as
        | { id: number }
        | undefined;
      return {
        lastInsertRowId: Number(rowidRow?.id ?? info.lastInsertRowid ?? 0),
        changes: info.changes,
      };
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = native.prepare(sql).get(...params);
      return (row ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return native.prepare(sql).all(...params) as T[];
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      native.exec('BEGIN IMMEDIATE');
      try {
        await fn();
        native.exec('COMMIT');
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    },
    async closeAsync() {
      databases.delete(name);
      native.close();
    },
  };
}

export async function openDatabaseAsync(name: string): Promise<ExpoSqliteDatabase> {
  const existing = databases.get(name);
  if (existing) {
    return wrap(existing, name);
  }
  const native = new Database(':memory:');
  databases.set(name, native);
  return wrap(native, name);
}

export async function deleteDatabaseAsync(name: string): Promise<void> {
  const native = databases.get(name);
  if (native) {
    native.close();
    databases.delete(name);
  }
}

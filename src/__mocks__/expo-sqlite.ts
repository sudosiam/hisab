export async function openDatabaseAsync() {
  return {
    execAsync: async () => {},
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    runAsync: async () => ({ lastInsertRowId: 0 }),
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    closeAsync: async () => {},
  };
}

export async function deleteDatabaseAsync() {}

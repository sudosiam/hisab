/** Serialize restore vs backup so they never touch the DB file concurrently. */
let maintenanceDepth = 0;
let restoreInProgress = false;
const restoreWaiters: (() => void)[] = [];

export function isDbMaintenanceBusy(): boolean {
  return maintenanceDepth > 0 || restoreInProgress;
}

export function isRestoreInProgress(): boolean {
  return restoreInProgress;
}

/** Block getDatabase() while a restore is rewriting the DB file on disk. */
export async function waitForDatabaseAccess(): Promise<void> {
  // Callers already inside withDbMaintenanceLock (including restore) may access the DB.
  if (!restoreInProgress || maintenanceDepth > 0) return;
  await new Promise<void>((resolve) => {
    restoreWaiters.push(resolve);
  });
}

function releaseRestoreWaiters(): void {
  restoreInProgress = false;
  const waiters = restoreWaiters.splice(0, restoreWaiters.length);
  for (const resolve of waiters) {
    resolve();
  }
}

export async function withDbMaintenanceLock<T>(work: () => Promise<T>): Promise<T> {
  maintenanceDepth += 1;
  await waitForDatabaseAccess();
  try {
    return await work();
  } finally {
    maintenanceDepth -= 1;
  }
}

/** Use for restore flows that replace the SQLite file on disk. */
export async function withDatabaseRestore<T>(work: () => Promise<T>): Promise<T> {
  return withDbMaintenanceLock(async () => {
    restoreInProgress = true;
    try {
      return await work();
    } finally {
      releaseRestoreWaiters();
    }
  });
}

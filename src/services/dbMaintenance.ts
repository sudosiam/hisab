/** Serialize restore vs backup so they never touch the DB file concurrently. */
let maintenanceDepth = 0;
let restoreInProgress = false;
let backupInProgress = false;
const accessWaiters: (() => void)[] = [];
let exclusiveLock: Promise<void> = Promise.resolve();

function notifyAccessWaiters(): void {
  if (!restoreInProgress && !backupInProgress) {
    const waiters = accessWaiters.splice(0, accessWaiters.length);
    for (const resolve of waiters) {
      resolve();
    }
  }
}

export function isDbMaintenanceBusy(): boolean {
  return maintenanceDepth > 0 || restoreInProgress || backupInProgress;
}

export function isRestoreInProgress(): boolean {
  return restoreInProgress;
}

export function isBackupInProgress(): boolean {
  return backupInProgress;
}

/** Block getDatabase() while restore/backup snapshots or rewrites the DB file. */
export async function waitForDatabaseAccess(): Promise<void> {
  if (maintenanceDepth > 0) return;
  if (!restoreInProgress && !backupInProgress) return;
  await new Promise<void>((resolve) => {
    accessWaiters.push(resolve);
  });
}

export async function withDbMaintenanceLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = exclusiveLock;
  let release!: () => void;
  exclusiveLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  maintenanceDepth += 1;
  await waitForDatabaseAccess();
  try {
    return await work();
  } finally {
    maintenanceDepth -= 1;
    release();
  }
}

/** Use for backup/export flows that checkpoint and read the SQLite file on disk. */
export async function withDatabaseBackup<T>(work: () => Promise<T>): Promise<T> {
  return withDbMaintenanceLock(async () => {
    backupInProgress = true;
    try {
      return await work();
    } finally {
      backupInProgress = false;
      notifyAccessWaiters();
    }
  });
}

/** Use for restore flows that replace the SQLite file on disk. */
export async function withDatabaseRestore<T>(work: () => Promise<T>): Promise<T> {
  return withDbMaintenanceLock(async () => {
    restoreInProgress = true;
    try {
      return await work();
    } finally {
      restoreInProgress = false;
      notifyAccessWaiters();
    }
  });
}

/** Serialize restore vs backup so they never touch the DB file concurrently. */
let maintenanceQueue: Promise<void> = Promise.resolve();

export async function withDbMaintenanceLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = maintenanceQueue;
  let release!: () => void;
  maintenanceQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export function isDbMaintenanceBusy(): boolean {
  return maintenanceQueue !== Promise.resolve();
}

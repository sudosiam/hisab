import {
  isBackupInProgress,
  isRestoreInProgress,
  withDatabaseBackup,
  withDatabaseRestore,
} from '../dbMaintenance';

describe('dbMaintenance', () => {
  afterEach(async () => {
    // Drain any in-flight maintenance work from prior tests.
    await Promise.allSettled([]);
  });

  it('serializes backup and restore so they never overlap', async () => {
    const events: string[] = [];

    const restore = withDatabaseRestore(async () => {
      events.push('restore-start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      events.push('restore-end');
    });

    const backup = withDatabaseBackup(async () => {
      events.push('backup-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('backup-end');
    });

    await Promise.all([restore, backup]);

    expect(events.indexOf('restore-end')).toBeLessThan(events.indexOf('backup-start'));
    expect(isRestoreInProgress()).toBe(false);
    expect(isBackupInProgress()).toBe(false);
  });
});

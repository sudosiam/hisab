/**
 * OS-scheduled daily backup via WorkManager (Android) / BGTaskScheduler (iOS).
 *
 * Not an exact midnight cron — the system runs this sometime after ~24h,
 * when battery/network conditions allow. Force-quit may pause until next open.
 *
 * TaskManager.defineTask MUST run in the global JS scope (see index.js).
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { isAutoBackupEnabled } from './backup';
import { isCloudBackupEnabled } from './cloudBackup';

export const BACKUP_BACKGROUND_TASK = 'hisab-daily-backup';

/** ~24 hours — OS treats this as a minimum delay, not an exact schedule. */
const MINIMUM_INTERVAL_MINUTES = 24 * 60;

TaskManager.defineTask(BACKUP_BACKGROUND_TASK, async () => {
  try {
    const { runDueBackups } = await import('./backup');
    await runDueBackups();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

async function shouldKeepBackgroundBackupRegistered(): Promise<boolean> {
  try {
    const localOn = await isAutoBackupEnabled();
    const cloudOn = await isCloudBackupEnabled();
    return localOn || cloudOn;
  } catch {
    return false;
  }
}

/** Register or unregister the OS task based on backup toggles. */
export async function syncBackupBackgroundTask(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;

    const want = await shouldKeepBackgroundBackupRegistered();
    const registered = await TaskManager.isTaskRegisteredAsync(BACKUP_BACKGROUND_TASK);

    if (want && !registered) {
      await BackgroundTask.registerTaskAsync(BACKUP_BACKGROUND_TASK, {
        minimumInterval: MINIMUM_INTERVAL_MINUTES,
      });
      return;
    }

    if (!want && registered) {
      await BackgroundTask.unregisterTaskAsync(BACKUP_BACKGROUND_TASK);
    }
  } catch {
    // Background scheduling is best-effort; foreground/launch backups still work.
  }
}

export async function isBackupBackgroundTaskRegistered(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKUP_BACKGROUND_TASK);
  } catch {
    return false;
  }
}

export async function getBackupBackgroundTaskStatusLabel(): Promise<string> {
  if (Platform.OS === 'web') return 'Unavailable on web';
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return 'Restricted by the system';
    }
    const registered = await isBackupBackgroundTaskRegistered();
    return registered
      ? 'OS will try about once a day (not exact midnight)'
      : 'Off — turn on local or cloud backup to schedule';
  } catch {
    return 'Unavailable';
  }
}

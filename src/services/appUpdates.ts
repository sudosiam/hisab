import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

export type UpdateCheckOutcome =
  | { kind: 'disabled' }
  | { kind: 'upToDate' }
  | { kind: 'available' }
  | { kind: 'error'; message: string };

export function isAppUpdatesEnabled(): boolean {
  return Updates.isEnabled && Platform.OS !== 'web';
}

/** Check remote channel for a newer JS update (no download). */
export async function checkForAppUpdate(): Promise<UpdateCheckOutcome> {
  if (!isAppUpdatesEnabled()) return { kind: 'disabled' };
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return { kind: 'upToDate' };
    return { kind: 'available' };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Download the latest update; call `reloadToApplyUpdate` to apply immediately. */
export async function downloadAppUpdate(): Promise<UpdateCheckOutcome> {
  if (!isAppUpdatesEnabled()) return { kind: 'disabled' };
  try {
    const result = await Updates.fetchUpdateAsync();
    if (!result.isNew) return { kind: 'upToDate' };
    return { kind: 'available' };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function reloadToApplyUpdate(): Promise<void> {
  await Updates.reloadAsync();
}

/** Check → download → reload when an update exists. Returns a short status for UI. */
export async function checkDownloadAndReload(): Promise<string> {
  const check = await checkForAppUpdate();
  if (check.kind === 'disabled') {
    return 'Updates are only available in release builds.';
  }
  if (check.kind === 'error') return check.message;
  if (check.kind === 'upToDate') return 'You are on the latest version.';

  const downloaded = await downloadAppUpdate();
  if (downloaded.kind === 'error') return downloaded.message;
  if (downloaded.kind === 'upToDate') return 'You are on the latest version.';

  await reloadToApplyUpdate();
  return 'Update installed.';
}

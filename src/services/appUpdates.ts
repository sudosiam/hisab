import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export type UpdateCheckOutcome =
  | { kind: 'disabled'; message: string }
  | { kind: 'upToDate' }
  | { kind: 'available' }
  | { kind: 'error'; message: string };

/** Default channel for local/release APKs that were not built via EAS (no baked-in channel). */
const FALLBACK_UPDATE_CHANNEL = 'production';

let checkInFlight: Promise<UpdateCheckOutcome> | null = null;
let downloadInFlight: Promise<UpdateCheckOutcome> | null = null;

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export function isAppUpdatesEnabled(): boolean {
  if (Platform.OS === 'web') return false;
  if (__DEV__) return false;
  if (isExpoGo()) return false;
  return Updates.isEnabled;
}

function updatesDisabledReason(): string {
  if (Platform.OS === 'web') return 'Updates are not available on web.';
  if (__DEV__ || isExpoGo()) {
    return 'Updates only work in a release APK/IPA (not Expo Go or development).';
  }
  if (!Updates.isEnabled) {
    return 'OTA updates are disabled in this build.';
  }
  return 'Updates are not available in this build.';
}

/** Ensure EAS Update gets a channel — local gradle APKs often lack one. */
function ensureUpdateChannelHeader(): void {
  if (!Updates.isEnabled) return;
  if (Updates.channel) return;
  try {
    Updates.setUpdateRequestHeadersOverride({
      'expo-channel-name': FALLBACK_UPDATE_CHANNEL,
    });
  } catch {
    // Older native binaries may not support overrides; native check will surface the error.
  }
}

function formatUpdateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code ?? '')
      : '';

  if (code === 'ERR_UPDATES_DISABLED' || /development mode|Expo Go|not enabled/i.test(raw)) {
    return updatesDisabledReason();
  }
  if (code === 'ERR_UPDATES_CHECK' || /failed to check for update/i.test(raw)) {
    return (
      'Could not reach the update server. Check internet, then confirm this build uses the ' +
      `"${Updates.channel ?? FALLBACK_UPDATE_CHANNEL}" channel and that an update was published ` +
      `(npm run update:prod).`
    );
  }
  if (code === 'ERR_UPDATES_FETCH' || /failed to (download|fetch)/i.test(raw)) {
    return 'An update was found but download failed. Check your connection and try again.';
  }
  // Strip noisy native wrapper text for the alert.
  const cleaned = raw
    .replace(/^Call to function ['"][^'"]+['"] has been rejected\.?\s*/i, '')
    .replace(/^Caused by:\s*/i, '')
    .trim();
  return cleaned || 'Could not check for updates.';
}

/** Check remote channel for a newer JS update (no download). */
export async function checkForAppUpdate(): Promise<UpdateCheckOutcome> {
  if (!isAppUpdatesEnabled()) {
    return { kind: 'disabled', message: updatesDisabledReason() };
  }
  if (checkInFlight) return checkInFlight;

  checkInFlight = (async () => {
    try {
      ensureUpdateChannelHeader();
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return { kind: 'upToDate' as const };
      return { kind: 'available' as const };
    } catch (e) {
      return { kind: 'error' as const, message: formatUpdateError(e) };
    } finally {
      checkInFlight = null;
    }
  })();

  return checkInFlight;
}

/** Download the latest update; call `reloadToApplyUpdate` to apply immediately. */
export async function downloadAppUpdate(): Promise<UpdateCheckOutcome> {
  if (!isAppUpdatesEnabled()) {
    return { kind: 'disabled', message: updatesDisabledReason() };
  }
  if (downloadInFlight) return downloadInFlight;

  downloadInFlight = (async () => {
    try {
      ensureUpdateChannelHeader();
      const result = await Updates.fetchUpdateAsync();
      if (!result.isNew) return { kind: 'upToDate' as const };
      return { kind: 'available' as const };
    } catch (e) {
      return { kind: 'error' as const, message: formatUpdateError(e) };
    } finally {
      downloadInFlight = null;
    }
  })();

  return downloadInFlight;
}

export async function reloadToApplyUpdate(): Promise<void> {
  try {
    await Updates.reloadAsync();
  } catch (e) {
    throw new Error(formatUpdateError(e));
  }
}

/** Check → download → reload when an update exists. Returns a short status for UI. */
export async function checkDownloadAndReload(): Promise<string> {
  const check = await checkForAppUpdate();
  if (check.kind === 'disabled') return check.message;
  if (check.kind === 'error') return check.message;
  if (check.kind === 'upToDate') return 'You are on the latest version.';

  const downloaded = await downloadAppUpdate();
  if (downloaded.kind === 'disabled') return downloaded.message;
  if (downloaded.kind === 'error') return downloaded.message;
  if (downloaded.kind === 'upToDate') return 'You are on the latest version.';

  try {
    await reloadToApplyUpdate();
    return 'Update installed.';
  } catch (e) {
    return e instanceof Error ? e.message : formatUpdateError(e);
  }
}

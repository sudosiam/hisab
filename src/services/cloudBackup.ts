/**
 * Optional Supabase cloud backup: full SQLite snapshots only.
 * Not multi-device sync — last upload wins per signed-in account.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parseISO, subDays } from 'date-fns';
import * as FileSystem from 'expo-file-system/legacy';
import type { Session } from '@supabase/supabase-js';
import { databaseHasUserData, getDatabase } from '../db/database';
import {
  formatLastBackupLabel,
  getBackupSafetyGuard,
  isAutoBackupPaused,
  readDatabaseBase64,
  restoreDatabaseFromUri,
  todayDateKey,
} from './backup';
import { withDatabaseBackup } from './dbMaintenance';
import {
  CLOUD_BACKUP_BUCKET,
  CLOUD_LATEST_OBJECT,
  getSupabaseClient,
  isSupabaseConfigured,
} from './supabaseClient';

const CLOUD_ENABLED_KEY = '@hisab_cloud_backup_enabled';
const CLOUD_LAST_BACKUP_KEY = '@hisab_cloud_last_backup';
const CLOUD_LAST_ERROR_KEY = '@hisab_cloud_backup_last_error';
const CLOUD_RECONCILE_ATTEMPTED_KEY = '@hisab_cloud_reconcile_attempted';

export const CLOUD_RETENTION_DAYS = 7;

const cloudBackupInFlight: { current: Promise<{ success: boolean; message: string }> | null } = {
  current: null,
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function objectPath(userId: string, fileName: string): string {
  return `${userId}/${fileName}`;
}

function datedBackupFileName(dateKey: string): string {
  return `hisab-backup-${dateKey}.db`;
}

// --- Preferences -----------------------------------------------------------

export async function isCloudBackupEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(CLOUD_ENABLED_KEY)) === 'true';
}

export async function setCloudBackupEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CLOUD_ENABLED_KEY, enabled ? 'true' : 'false');
  const { syncBackupBackgroundTask } = await import('./backupBackgroundTask');
  await syncBackupBackgroundTask().catch(() => {});
}

export async function getLastCloudBackupAt(): Promise<string | null> {
  return AsyncStorage.getItem(CLOUD_LAST_BACKUP_KEY);
}

export async function getLastCloudBackupDate(): Promise<string | null> {
  const value = await getLastCloudBackupAt();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    return format(parseISO(value), 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

export { formatLastBackupLabel as formatLastCloudBackupLabel };

async function recordCloudBackupSuccess(): Promise<void> {
  await AsyncStorage.setItem(CLOUD_LAST_BACKUP_KEY, new Date().toISOString());
  await AsyncStorage.removeItem(CLOUD_LAST_ERROR_KEY);
}

async function recordCloudBackupError(message: string): Promise<void> {
  await AsyncStorage.setItem(CLOUD_LAST_ERROR_KEY, `${new Date().toISOString()}||${message}`);
}

export async function getCloudBackupLastError(): Promise<{ at: string; message: string } | null> {
  const raw = await AsyncStorage.getItem(CLOUD_LAST_ERROR_KEY);
  if (!raw) return null;
  const idx = raw.indexOf('||');
  if (idx === -1) return { at: '', message: raw };
  return { at: raw.slice(0, idx), message: raw.slice(idx + 2) };
}

async function wasCloudReconcileAttempted(): Promise<boolean> {
  return (await AsyncStorage.getItem(CLOUD_RECONCILE_ATTEMPTED_KEY)) === 'true';
}

async function markCloudReconcileAttempted(): Promise<void> {
  await AsyncStorage.setItem(CLOUD_RECONCILE_ATTEMPTED_KEY, 'true');
}

export async function clearCloudReconcileAttempted(): Promise<void> {
  await AsyncStorage.removeItem(CLOUD_RECONCILE_ATTEMPTED_KEY);
}

// --- Auth ------------------------------------------------------------------

export async function getCloudSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function getCloudUserEmail(): Promise<string | null> {
  const session = await getCloudSession();
  return session?.user?.email ?? null;
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return { success: false, message: 'Enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters.' };
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  });
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Signed in.' };
}

export async function signUpWithEmailPassword(
  email: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return { success: false, message: 'Enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters.' };
  }
  const { data, error } = await supabase.auth.signUp({
    email: trimmed,
    password,
  });
  if (error) return { success: false, message: error.message };
  if (!data.session) {
    return {
      success: false,
      message:
        'Account created. If email confirmation is required, confirm it in your inbox, then sign in.',
    };
  }
  return { success: true, message: 'Account created and signed in.' };
}

export async function signOutCloudBackup(): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    await setCloudBackupEnabled(false);
    return { success: true, message: 'Signed out.' };
  }
  const { error } = await supabase.auth.signOut();
  await setCloudBackupEnabled(false);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Signed out. Cloud backup is off.' };
}

// --- Storage helpers -------------------------------------------------------

async function getSchemaVersionLabel(): Promise<string | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'schema_version'`
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function upsertCloudBackupMetadata(
  userId: string,
  byteSize: number,
  schemaVersion: string | null
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  // Best-effort: bucket works even if the optional metadata table is missing.
  await supabase.from('cloud_backups').upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
      byte_size: byteSize,
      schema_version: schemaVersion,
    },
    { onConflict: 'user_id' }
  );
}

async function pruneOldCloudDatedBackups(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const cutoff = format(subDays(new Date(), CLOUD_RETENTION_DAYS), 'yyyy-MM-dd');
  const { data, error } = await supabase.storage.from(CLOUD_BACKUP_BUCKET).list(userId, {
    limit: 100,
  });
  if (error || !data) return;

  const toRemove = data
    .map((item) => item.name)
    .filter((name) => {
      const match = name.match(/^hisab-backup-(\d{4}-\d{2}-\d{2})\.db$/);
      return Boolean(match && match[1] < cutoff);
    })
    .map((name) => objectPath(userId, name));

  if (toRemove.length > 0) {
    await supabase.storage.from(CLOUD_BACKUP_BUCKET).remove(toRemove);
  }
}

export async function cloudLatestBackupExists(): Promise<boolean> {
  const supabase = getSupabaseClient();
  const session = await getCloudSession();
  if (!supabase || !session?.user?.id) return false;

  const path = objectPath(session.user.id, CLOUD_LATEST_OBJECT);
  const { data, error } = await supabase.storage.from(CLOUD_BACKUP_BUCKET).createSignedUrl(path, 30);
  return Boolean(data?.signedUrl) && !error;
}

/** Download latest cloud snapshot to cache; returns a local file URI. */
export async function downloadLatestCloudBackupToCache(): Promise<{
  success: boolean;
  uri?: string;
  message: string;
}> {
  const supabase = getSupabaseClient();
  const session = await getCloudSession();
  if (!supabase) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  if (!session?.user?.id) {
    return { success: false, message: 'Sign in to restore from cloud.' };
  }

  const path = objectPath(session.user.id, CLOUD_LATEST_OBJECT);
  const { data: signed, error: signError } = await supabase.storage
    .from(CLOUD_BACKUP_BUCKET)
    .createSignedUrl(path, 120);
  if (signError || !signed?.signedUrl) {
    return {
      success: false,
      message: signError?.message ?? 'No cloud backup found for this account.',
    };
  }

  const dest = `${FileSystem.cacheDirectory}hisab-cloud-restore.db`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  const download = await FileSystem.downloadAsync(signed.signedUrl, dest);
  if (download.status !== 200) {
    return { success: false, message: `Cloud download failed (HTTP ${download.status}).` };
  }
  return { success: true, uri: download.uri, message: 'Downloaded.' };
}

// --- Upload / restore ------------------------------------------------------

async function uploadCloudBackupLocked(): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  const session = await getCloudSession();
  if (!supabase) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  if (!session?.user?.id) {
    return { success: false, message: 'Sign in to back up to the cloud.' };
  }

  const guard = await getBackupSafetyGuard();
  if (guard.blocked) {
    return { success: false, message: guard.message ?? 'Backup blocked.' };
  }

  if (cloudBackupInFlight.current) return cloudBackupInFlight.current;

  cloudBackupInFlight.current = withDatabaseBackup(async () => {
    try {
      const base64 = await readDatabaseBase64();
      const bytes = base64ToUint8Array(base64);
      const userId = session.user.id;
      const dateKey = todayDateKey();
      const latestPath = objectPath(userId, CLOUD_LATEST_OBJECT);
      const datedPath = objectPath(userId, datedBackupFileName(dateKey));
      const contentType = 'application/octet-stream';

      const latestUpload = await supabase.storage.from(CLOUD_BACKUP_BUCKET).upload(latestPath, bytes, {
        contentType,
        upsert: true,
      });
      if (latestUpload.error) {
        return { success: false, message: latestUpload.error.message };
      }

      const datedUpload = await supabase.storage.from(CLOUD_BACKUP_BUCKET).upload(datedPath, bytes, {
        contentType,
        upsert: true,
      });
      if (datedUpload.error) {
        return { success: false, message: datedUpload.error.message };
      }

      await pruneOldCloudDatedBackups(userId);
      await upsertCloudBackupMetadata(userId, bytes.byteLength, await getSchemaVersionLabel());

      return { success: true, message: 'Cloud backup saved.' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Cloud backup failed.',
      };
    }
  });

  try {
    return await cloudBackupInFlight.current;
  } finally {
    cloudBackupInFlight.current = null;
  }
}

/** Manual or first-enable full upload of the local SQLite file. */
export async function uploadCloudBackup(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  const result = await uploadCloudBackupLocked();
  if (result.success) {
    await recordCloudBackupSuccess();
  } else {
    await recordCloudBackupError(result.message);
  }
  return result;
}

/** Restore local DB from the account’s latest cloud snapshot. */
export async function restoreDatabaseFromCloud(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  const downloaded = await downloadLatestCloudBackupToCache();
  if (!downloaded.success || !downloaded.uri) {
    return { success: false, message: downloaded.message };
  }
  const result = await restoreDatabaseFromUri(downloaded.uri, CLOUD_LATEST_OBJECT);
  try {
    await FileSystem.deleteAsync(downloaded.uri, { idempotent: true });
  } catch {
    // Cache cleanup is best-effort.
  }
  return result;
}

/** Once per calendar day while cloud backup is enabled and signed in. */
export async function runCloudDailyBackupIfDue(): Promise<{ ran: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ran: false };
  if (!(await isCloudBackupEnabled())) return { ran: false };
  const session = await getCloudSession();
  if (!session) return { ran: false };

  const today = todayDateKey();
  if ((await getLastCloudBackupDate()) === today) return { ran: false };

  const result = await uploadCloudBackup();
  return { ran: result.success, message: result.message };
}

/** Background upload when cloud backup is on (same safety guards as daily). */
export async function cloudBackupOnBackground(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!(await isCloudBackupEnabled())) return;
  const session = await getCloudSession();
  if (!session) return;
  await uploadCloudBackup();
}

/**
 * First-time reconcile: if local DB is empty and a cloud snapshot exists,
 * restore once. Skipped after reset pause and never runs when local has data.
 */
export async function reconcileCloudBackupOnEmptyLocal(): Promise<{
  restored: boolean;
  message?: string;
}> {
  if (!isSupabaseConfigured()) return { restored: false };
  if (!(await isCloudBackupEnabled())) return { restored: false };
  if (await isAutoBackupPaused()) return { restored: false };
  if (await wasCloudReconcileAttempted()) return { restored: false };

  const session = await getCloudSession();
  if (!session) return { restored: false };

  try {
    if (await databaseHasUserData()) return { restored: false };
  } catch {
    return { restored: false };
  }

  const exists = await cloudLatestBackupExists();
  if (!exists) return { restored: false };

  await markCloudReconcileAttempted();
  const result = await restoreDatabaseFromCloud();
  if (result.success) {
    return { restored: true, message: result.message };
  }
  await recordCloudBackupError(result.message);
  return { restored: false, message: result.message };
}

/** Enable cloud backup after OTP sign-in and run the first full upload. */
export async function enableCloudBackupAfterSignIn(): Promise<{ success: boolean; message: string }> {
  await setCloudBackupEnabled(true);
  await clearCloudReconcileAttempted();
  return uploadCloudBackup();
}

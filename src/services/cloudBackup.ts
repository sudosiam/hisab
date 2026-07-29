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
const CLOUD_RECONCILE_FAIL_KEY = '@hisab_cloud_reconcile_failures';
/** Skip rapid repeat uploads when leaving the app many times the same day. */
const CLOUD_BACKGROUND_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLOUD_RECONCILE_MAX_FAILURES = 3;

export const CLOUD_RETENTION_DAYS = 30;
/** Personal / single-owner builds: same floor for sign-in and sign-up. */
export const CLOUD_PASSWORD_MIN_SIGN_IN = 10;
/** New accounts require a strong password (full books leave the device). */
export const CLOUD_PASSWORD_MIN_SIGN_UP = 10;

/**
 * Optional owner lock. When `EXPO_PUBLIC_CLOUD_OWNER_EMAIL` is set, only that
 * email may sign in or create a cloud-backup account (personal single-user).
 */
export function getCloudOwnerEmail(): string | null {
  const raw = process.env.EXPO_PUBLIC_CLOUD_OWNER_EMAIL?.trim().toLowerCase() ?? '';
  return raw.includes('@') ? raw : null;
}

export function isCloudOwnerLockEnabled(): boolean {
  return getCloudOwnerEmail() != null;
}

function assertCloudEmailAllowed(
  email: string
): { ok: true } | { ok: false; message: string } {
  const owner = getCloudOwnerEmail();
  if (!owner) return { ok: true };
  if (email.trim().toLowerCase() !== owner) {
    return {
      ok: false,
      message: 'This Hisab build only allows the owner email for cloud backup.',
    };
  }
  return { ok: true };
}

const cloudBackupInFlight: { current: Promise<{ success: boolean; message: string }> | null } = {
  current: null,
};

/** Decode base64 in chunks so a large DB backup does not spike memory via one giant atob(). */
export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outputLen = Math.floor((clean.length * 3) / 4) - padding;
  const bytes = new Uint8Array(Math.max(0, outputLen));
  let byteIndex = 0;
  // Multiple of 4 so atob chunks stay valid.
  const CHUNK = 0x8000;
  for (let offset = 0; offset < clean.length; ) {
    let end = Math.min(offset + CHUNK, clean.length);
    if (end < clean.length) {
      end -= end % 4;
    }
    if (end <= offset) {
      end = Math.min(offset + 4, clean.length);
    }
    const binary = atob(clean.slice(offset, end));
    for (let j = 0; j < binary.length && byteIndex < bytes.length; j += 1) {
      bytes[byteIndex] = binary.charCodeAt(j);
      byteIndex += 1;
    }
    offset = end;
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
  await AsyncStorage.removeItem(CLOUD_RECONCILE_FAIL_KEY);
}

export async function clearCloudReconcileAttempted(): Promise<void> {
  await AsyncStorage.multiRemove([CLOUD_RECONCILE_ATTEMPTED_KEY, CLOUD_RECONCILE_FAIL_KEY]);
}

/** User chose start fresh — do not auto-restore cloud onto the empty DB. */
export async function skipCloudReconcileAfterFreshStart(): Promise<void> {
  await markCloudReconcileAttempted();
}

async function recordCloudReconcileFailure(): Promise<void> {
  const raw = await AsyncStorage.getItem(CLOUD_RECONCILE_FAIL_KEY);
  let count = 0;
  let day = todayDateKey();
  if (raw) {
    const [storedDay, storedCount] = raw.split('|');
    if (storedDay === day) count = Number.parseInt(storedCount, 10) || 0;
  }
  count += 1;
  await AsyncStorage.setItem(CLOUD_RECONCILE_FAIL_KEY, `${day}|${count}`);
}

async function shouldSkipCloudReconcileAfterFailures(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(CLOUD_RECONCILE_FAIL_KEY);
  if (!raw) return false;
  const [storedDay, storedCount] = raw.split('|');
  if (storedDay !== todayDateKey()) return false;
  return (Number.parseInt(storedCount, 10) || 0) >= CLOUD_RECONCILE_MAX_FAILURES;
}

/** Delete all cloud backup objects for the signed-in user and clear local cloud markers. */
export async function deleteCloudBackups(): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  const session = await getCloudSession();
  if (!supabase) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  if (!session?.user?.id) {
    return { success: false, message: 'Sign in to cloud backup first.' };
  }

  const userId = session.user.id;
  try {
    const { data, error } = await supabase.storage.from(CLOUD_BACKUP_BUCKET).list(userId, {
      limit: 200,
    });
    if (error) {
      return { success: false, message: error.message };
    }
    const paths = (data ?? [])
      .map((item) => item.name)
      .filter(Boolean)
      .map((name) => objectPath(userId, name));
    // Always try to remove the known latest object even if list is empty/stale.
    const latestPath = objectPath(userId, CLOUD_LATEST_OBJECT);
    if (!paths.includes(latestPath)) paths.push(latestPath);

    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from(CLOUD_BACKUP_BUCKET).remove(paths);
      if (removeError) {
        return { success: false, message: removeError.message };
      }
    }

    await supabase.from('cloud_backups').delete().eq('user_id', userId);
    await AsyncStorage.removeItem(CLOUD_LAST_BACKUP_KEY);
    await AsyncStorage.removeItem(CLOUD_LAST_ERROR_KEY);
    await clearCloudReconcileAttempted();
    return { success: true, message: 'Cloud backup deleted.' };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Could not delete cloud backup.',
    };
  }
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
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return { success: false, message: 'Enter a valid email address.' };
  }
  const allowed = assertCloudEmailAllowed(trimmed);
  if (!allowed.ok) return { success: false, message: allowed.message };
  if (!password || password.length < CLOUD_PASSWORD_MIN_SIGN_IN) {
    return {
      success: false,
      message: `Password must be at least ${CLOUD_PASSWORD_MIN_SIGN_IN} characters.`,
    };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  });
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Signed in.' };
}

function isEmailConfirmed(session: Session): boolean {
  return Boolean(session.user.email_confirmed_at);
}

export async function signUpWithEmailPassword(
  email: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return { success: false, message: 'Enter a valid email address.' };
  }
  const allowed = assertCloudEmailAllowed(trimmed);
  if (!allowed.ok) return { success: false, message: allowed.message };
  if (!password || password.length < CLOUD_PASSWORD_MIN_SIGN_UP) {
    return {
      success: false,
      message: `Password must be at least ${CLOUD_PASSWORD_MIN_SIGN_UP} characters.`,
    };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
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
        'Account created. Confirm the email we sent, then sign in before enabling cloud backup.',
    };
  }
  if (!isEmailConfirmed(data.session)) {
    await supabase.auth.signOut();
    return {
      success: false,
      message:
        'Account created. Confirm the email we sent, then sign in before enabling cloud backup.',
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

export interface CloudBackupSnapshot {
  fileName: string;
  dateKey: string | null;
  isLatest: boolean;
  updatedAt: string | null;
  byteSize: number | null;
}

/** List dated cloud objects plus latest metadata for restore picker. */
export async function listCloudBackupSnapshots(): Promise<{
  success: boolean;
  snapshots: CloudBackupSnapshot[];
  message?: string;
}> {
  const supabase = getSupabaseClient();
  const session = await getCloudSession();
  if (!supabase) {
    return { success: false, snapshots: [], message: 'Cloud backup is not configured on this build.' };
  }
  if (!session?.user?.id) {
    return { success: false, snapshots: [], message: 'Sign in to list cloud backups.' };
  }

  const userId = session.user.id;
  const { data, error } = await supabase.storage.from(CLOUD_BACKUP_BUCKET).list(userId, {
    limit: 100,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (error) {
    return { success: false, snapshots: [], message: error.message };
  }

  const meta = await supabase
    .from('cloud_backups')
    .select('updated_at, byte_size, schema_version')
    .eq('user_id', userId)
    .maybeSingle();

  const snapshots: CloudBackupSnapshot[] = [];
  for (const item of data ?? []) {
    const name = item.name;
    if (!name) continue;
    const dated = name.match(/^hisab-backup-(\d{4}-\d{2}-\d{2})\.db$/);
    const isLatest = name === CLOUD_LATEST_OBJECT;
    if (!dated && !isLatest) continue;
    snapshots.push({
      fileName: name,
      dateKey: dated?.[1] ?? null,
      isLatest,
      updatedAt: item.updated_at ?? (isLatest ? meta.data?.updated_at ?? null : null),
      byteSize: item.metadata?.size ?? (isLatest ? meta.data?.byte_size ?? null : null),
    });
  }

  snapshots.sort((a, b) => {
    if (a.isLatest && !b.isLatest) return -1;
    if (!a.isLatest && b.isLatest) return 1;
    return (b.dateKey ?? '').localeCompare(a.dateKey ?? '');
  });

  return { success: true, snapshots };
}

/** Remote latest metadata timestamp (ISO), if available. */
export async function getRemoteCloudUpdatedAt(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const session = await getCloudSession();
  if (!supabase || !session?.user?.id) return null;
  const { data } = await supabase
    .from('cloud_backups')
    .select('updated_at')
    .eq('user_id', session.user.id)
    .maybeSingle();
  return data?.updated_at ?? null;
}

/**
 * True when remote cloud snapshot is newer than the last successful local upload.
 * Used to block accidental overwrite (last-upload-wins protection).
 */
export async function isRemoteCloudNewerThanLocal(): Promise<boolean> {
  const remote = await getRemoteCloudUpdatedAt();
  const local = await getLastCloudBackupAt();
  if (!remote) return false;
  if (!local) return true;
  const remoteMs = Date.parse(remote);
  const localMs = Date.parse(local);
  if (!Number.isFinite(remoteMs)) return false;
  if (!Number.isFinite(localMs)) return true;
  return remoteMs > localMs + 2000;
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

/** Download a named cloud snapshot (latest or dated) to cache. */
export async function downloadCloudBackupToCache(
  fileName: string = CLOUD_LATEST_OBJECT
): Promise<{
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

  const path = objectPath(session.user.id, fileName);
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

/** Download latest cloud snapshot to cache; returns a local file URI. */
export async function downloadLatestCloudBackupToCache(): Promise<{
  success: boolean;
  uri?: string;
  message: string;
}> {
  return downloadCloudBackupToCache(CLOUD_LATEST_OBJECT);
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
  if (!isEmailConfirmed(session)) {
    return {
      success: false,
      message: 'Confirm your email before uploading a cloud backup, then sign in again.',
    };
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

      // Dated object first so a failure never leaves only a new "latest" pointer.
      const datedUpload = await supabase.storage.from(CLOUD_BACKUP_BUCKET).upload(datedPath, bytes, {
        contentType,
        upsert: true,
      });
      if (datedUpload.error) {
        return { success: false, message: datedUpload.error.message };
      }

      const latestUpload = await supabase.storage.from(CLOUD_BACKUP_BUCKET).upload(latestPath, bytes, {
        contentType,
        upsert: true,
      });
      if (latestUpload.error) {
        return {
          success: false,
          message: `Dated backup saved, but updating latest failed: ${latestUpload.error.message}`,
        };
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
export async function uploadCloudBackup(options?: {
  force?: boolean;
}): Promise<{ success: boolean; message: string; needsForce?: boolean }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  if (!options?.force) {
    try {
      if (await isRemoteCloudNewerThanLocal()) {
        return {
          success: false,
          needsForce: true,
          message:
            'Remote backup is newer than this device’s last upload. Restore from cloud first, or force upload to overwrite.',
        };
      }
    } catch {
      // If metadata check fails, allow upload (same as before).
    }
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
  return restoreDatabaseFromCloudFile(CLOUD_LATEST_OBJECT);
}

/** Restore from a specific cloud object name (latest or dated). */
export async function restoreDatabaseFromCloudFile(
  fileName: string
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Cloud backup is not configured on this build.' };
  }
  const downloaded = await downloadCloudBackupToCache(fileName);
  if (!downloaded.success || !downloaded.uri) {
    return { success: false, message: downloaded.message };
  }
  const result = await restoreDatabaseFromUri(downloaded.uri, fileName);
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
  if (result.success) {
    const { notifyAutoBackupDone } = await import('./localNotifications');
    await notifyAutoBackupDone('cloud').catch(() => {});
  }
  return { ran: result.success, message: result.message };
}

/** Background upload when cloud backup is on — throttled to avoid thrash on every app leave. */
export async function cloudBackupOnBackground(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!(await isCloudBackupEnabled())) return;
  const session = await getCloudSession();
  if (!session) return;

  const lastAt = await getLastCloudBackupAt();
  if (lastAt) {
    try {
      const lastMs = /^\d{4}-\d{2}-\d{2}$/.test(lastAt)
        ? parseISO(`${lastAt}T00:00:00`).getTime()
        : parseISO(lastAt).getTime();
      if (
        Number.isFinite(lastMs) &&
        Date.now() - lastMs < CLOUD_BACKGROUND_MIN_INTERVAL_MS &&
        (await getLastCloudBackupDate()) === todayDateKey()
      ) {
        return;
      }
    } catch {
      // Fall through and attempt upload.
    }
  }

  await uploadCloudBackup();
}

/**
 * First-time reconcile: if local DB is empty and a cloud snapshot exists,
 * restore once. Marked complete only after success so transient failures can retry.
 * After several failures the same day, skips until the user signs in again / clears cloud.
 */
export async function reconcileCloudBackupOnEmptyLocal(): Promise<{
  restored: boolean;
  message?: string;
}> {
  if (!isSupabaseConfigured()) return { restored: false };
  if (!(await isCloudBackupEnabled())) return { restored: false };
  if (await isAutoBackupPaused()) return { restored: false };
  if (await wasCloudReconcileAttempted()) return { restored: false };
  if (await shouldSkipCloudReconcileAfterFailures()) {
    return {
      restored: false,
      message: 'Cloud restore skipped after repeated failures today. Try Restore from cloud in Settings.',
    };
  }

  const session = await getCloudSession();
  if (!session) return { restored: false };

  try {
    if (await databaseHasUserData()) return { restored: false };
  } catch {
    return { restored: false };
  }

  const exists = await cloudLatestBackupExists();
  if (!exists) return { restored: false };

  const result = await restoreDatabaseFromCloud();
  if (result.success) {
    await markCloudReconcileAttempted();
    return { restored: true, message: result.message };
  }
  await recordCloudReconcileFailure();
  await recordCloudBackupError(result.message);
  return { restored: false, message: result.message };
}

/** Enable cloud backup after email/password sign-in and run the first full upload. */
export async function enableCloudBackupAfterSignIn(): Promise<{ success: boolean; message: string }> {
  await setCloudBackupEnabled(true);
  await clearCloudReconcileAttempted();
  return uploadCloudBackup();
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parse, parseISO, subDays } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  checkpointDatabase,
  closeDatabase,
  DB_NAME,
  databaseHasUserData,
  getDatabase,
  invalidateDatabase,
} from '../db/database';
import { withDatabaseBackup, withDatabaseRestore } from './dbMaintenance';

export interface PickedBackupFile {
  uri: string;
  name: string;
}

const BACKUP_FOLDER_KEY = '@hisab_backup_folder';
const AUTO_BACKUP_KEY = '@hisab_auto_backup';
const AUTO_BACKUP_PAUSED_KEY = '@hisab_auto_backup_paused';
const LAST_DAILY_BACKUP_KEY = '@hisab_last_daily_backup';
const LAST_ERROR_KEY = '@hisab_backup_last_error';
const BACKUP_PREFIX = 'hisab-backup-';

export const RETENTION_DAYS = 30;

// --- Preferences -----------------------------------------------------------

export async function getBackupFolderUri(): Promise<string | null> {
  return AsyncStorage.getItem(BACKUP_FOLDER_KEY);
}

export async function setBackupFolderUri(uri: string): Promise<void> {
  await AsyncStorage.setItem(BACKUP_FOLDER_KEY, uri);
}

export async function isAutoBackupEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTO_BACKUP_KEY)) === 'true';
}

export async function setAutoBackupEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(AUTO_BACKUP_KEY, enabled ? 'true' : 'false');
}

/** Block auto backup after reset until a restore completes. */
export async function pauseAutoBackupAfterReset(): Promise<void> {
  await AsyncStorage.setItem(AUTO_BACKUP_PAUSED_KEY, 'reset');
  await setAutoBackupEnabled(false);
}

export async function clearAutoBackupPause(): Promise<void> {
  await AsyncStorage.removeItem(AUTO_BACKUP_PAUSED_KEY);
}

export async function isAutoBackupPaused(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTO_BACKUP_PAUSED_KEY)) === 'reset';
}

export async function getLastBackupAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_DAILY_BACKUP_KEY);
}

/** Date key (yyyy-MM-dd) of the last backup, for daily backup scheduling. */
export async function getLastDailyBackupDate(): Promise<string | null> {
  const value = await getLastBackupAt();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    return format(parseISO(value), 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

export function formatLastBackupLabel(value: string | null): string {
  if (!value) return 'Never';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return format(parse(value, 'yyyy-MM-dd', new Date()), 'd MMM yyyy');
    }
    return format(parseISO(value), 'd MMM yyyy, h:mm a');
  } catch {
    return value;
  }
}

async function recordBackupSuccess(): Promise<void> {
  await AsyncStorage.setItem(LAST_DAILY_BACKUP_KEY, new Date().toISOString());
  await AsyncStorage.removeItem(LAST_ERROR_KEY);
}

async function recordBackupError(message: string): Promise<void> {
  await AsyncStorage.setItem(LAST_ERROR_KEY, `${new Date().toISOString()}||${message}`);
}

/** The last backup failure (if any), so Settings can warn that backups aren't running. */
export async function getBackupLastError(): Promise<{ at: string; message: string } | null> {
  const raw = await AsyncStorage.getItem(LAST_ERROR_KEY);
  if (!raw) return null;
  const idx = raw.indexOf('||');
  if (idx === -1) return { at: '', message: raw };
  return { at: raw.slice(0, idx), message: raw.slice(idx + 2) };
}

/** Prevent empty or post-reset databases from overwriting real backups. */
async function getBackupSafetyGuard(): Promise<{ blocked: boolean; message?: string }> {
  try {
    if (await isAutoBackupPaused()) {
      return {
        blocked: true,
        message:
          'Backup is paused after reset. Restore from your backup folder first, then turn auto backup back on.',
      };
    }
    if (!(await databaseHasUserData())) {
      return {
        blocked: true,
        message: 'Database has no data yet. Backup skipped — add data or restore first.',
      };
    }
    return { blocked: false };
  } catch {
    return { blocked: true, message: 'Backup skipped due to a temporary error.' };
  }
}

// --- SAF helpers -----------------------------------------------------------

function isSafUri(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && uri.startsWith('content://') && uri.length > 15;
}

async function safReadDirectory(dirUri: string): Promise<string[]> {
  if (!isSafUri(dirUri)) return [];
  try {
    return await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    return [];
  }
}

function nameFromSafUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const segment = decoded.split('/').filter(Boolean).pop() ?? '';
  const name = segment.includes(':') ? segment.split(':').pop() ?? segment : segment;
  return name.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function backupBaseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '') || fileName;
}

/** Match SAF display names including Drive-style duplicates like "name (1).db". */
function safNameMatchesBackupFile(safName: string, fileName: string): boolean {
  const saf = safName.toLowerCase();
  const target = fileName.toLowerCase();
  if (saf === target) return true;

  const base = backupBaseName(fileName).toLowerCase();
  if (saf === base) return true;
  if (saf === backupBaseName(target)) return true;

  const duplicatePattern = new RegExp(`^${escapeRegExp(base)}(?: \\(\\d+\\))?(?:\\.[^.]+)?$`, 'i');
  return duplicatePattern.test(saf);
}

async function findSafFilesInDir(dirUri: string, fileName: string): Promise<string[]> {
  const entries = await safReadDirectory(dirUri);
  return entries.filter((uri) => safNameMatchesBackupFile(nameFromSafUri(uri), fileName));
}

async function findSafFileInDir(dirUri: string, fileName: string): Promise<string | null> {
  const matches = await findSafFilesInDir(dirUri, fileName);
  if (matches.length === 0) return null;
  const exact = matches.find((uri) => nameFromSafUri(uri).toLowerCase() === fileName.toLowerCase());
  return exact ?? matches[0];
}

async function deleteBackupFile(uri: string): Promise<void> {
  await FileSystem.StorageAccessFramework.deleteAsync(uri, { idempotent: true });
}

/** Write (or overwrite) a base64 file into the SAF backup folder, de-duplicating copies. */
async function writeBase64FileToSaf(
  folderUri: string,
  fileName: string,
  mimeType: string,
  base64: string
): Promise<string> {
  const existingFiles = await findSafFilesInDir(folderUri, fileName);
  if (existingFiles.length > 0) {
    const primary = (await findSafFileInDir(folderUri, fileName)) ?? existingFiles[0];
    await FileSystem.writeAsStringAsync(primary, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    for (const uri of existingFiles) {
      if (uri !== primary) await deleteBackupFile(uri);
    }
    return primary;
  }

  const baseName = backupBaseName(fileName) || 'file';
  const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
    folderUri,
    baseName,
    mimeType
  );
  await FileSystem.writeAsStringAsync(destUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return destUri;
}

// --- Paths & file helpers --------------------------------------------------

function getDbPath(): string {
  return `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
}

function todayDateKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Backup files are plain SQLite databases named hisab-backup-YYYY-MM-DD.db. */
function backupFileName(dateKey: string): string {
  return `${BACKUP_PREFIX}${dateKey}.db`;
}

function parseDateKeyFromName(name: string): string | null {
  return name.match(/hisab-backup-(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function isSqliteDatabaseBase64(base64: string): boolean {
  try {
    return atob(base64.slice(0, 24)).startsWith('SQLite format 3');
  } catch {
    return false;
  }
}

/** Locate a legacy `database/` subfolder from older app versions (backups used to live there). */
async function findLegacyDatabaseDir(folderUri: string): Promise<string | null> {
  const entries = await safReadDirectory(folderUri);
  for (const uri of entries) {
    if (nameFromSafUri(uri).toLowerCase() === 'database') return uri;
  }
  return null;
}

async function listBackupFiles(folderUri: string): Promise<{ uri: string; dateKey: string }[]> {
  if (!isSafUri(folderUri)) return [];
  // Scan the folder root (current layout) and the legacy `database/` subfolder
  // (older versions), so upgrading users can still restore/clean older backups.
  const dirs = [folderUri];
  const legacyDir = await findLegacyDatabaseDir(folderUri);
  if (legacyDir) dirs.push(legacyDir);

  const files: { uri: string; dateKey: string }[] = [];
  for (const dir of dirs) {
    for (const uri of await safReadDirectory(dir)) {
      const dateKey = parseDateKeyFromName(nameFromSafUri(uri));
      if (dateKey) files.push({ uri, dateKey });
    }
  }
  return files;
}

async function removeBackupForDate(folderUri: string, dateKey: string, keepUri?: string): Promise<void> {
  const files = await listBackupFiles(folderUri);
  for (const file of files) {
    if (file.dateKey === dateKey && file.uri !== keepUri) {
      await deleteBackupFile(file.uri);
    }
  }
}

async function cleanupOldBackups(folderUri: string): Promise<number> {
  const cutoff = format(subDays(new Date(), RETENTION_DAYS), 'yyyy-MM-dd');
  const files = await listBackupFiles(folderUri);
  let removed = 0;
  for (const file of files) {
    if (file.dateKey < cutoff) {
      await deleteBackupFile(file.uri);
      removed += 1;
    }
  }
  return removed;
}

/** Read the live database file as base64, after folding WAL data into it. */
async function readDatabaseBase64(): Promise<string> {
  // A backup taken after a failed checkpoint would silently miss the newest
  // transactions, so fail loudly instead.
  await checkpointDatabase({ strict: true });
  // Close the connection so no new WAL pages land between checkpoint and read.
  await invalidateDatabase();
  return FileSystem.readAsStringAsync(getDbPath(), {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Overwrite the app database with a base64 SQLite payload, clearing stale WAL/SHM. */
async function writeDatabaseFromBase64(base64: string): Promise<void> {
  const dbPath = getDbPath();
  await FileSystem.writeAsStringAsync(dbPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  for (const suffix of ['-wal', '-shm']) {
    try {
      await FileSystem.deleteAsync(`${dbPath}${suffix}`, { idempotent: true });
    } catch {
      // Sidecar files may not exist; ignore.
    }
  }
}

// --- Folder selection ------------------------------------------------------

export async function pickBackupFolder(): Promise<string | null> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return null;
  await setBackupFolderUri(permissions.directoryUri);
  return permissions.directoryUri;
}

/** Verify the saved folder is still accessible; used when Settings loads. */
export async function ensureBackupFolderReady(folderUri: string): Promise<void> {
  if (!isSafUri(folderUri)) {
    throw new Error('Backup folder access expired. Re-select the folder in Settings.');
  }
}

// --- Backup to folder ------------------------------------------------------

// Serialize backups so the daily and app-lifecycle backups can't overlap.
const backupInFlight: { current: Promise<{ success: boolean; message: string }> | null } = {
  current: null,
};

async function writeBackupToFolder(
  folderUri: string,
  dateKey: string
): Promise<{ success: boolean; message: string }> {
  if (backupInFlight.current) return backupInFlight.current;
  backupInFlight.current = withDatabaseBackup(async () => {
    if (!isSafUri(folderUri)) {
      return { success: false, message: 'Backup folder access expired. Re-select the folder in Settings.' };
    }
    const info = await FileSystem.getInfoAsync(getDbPath());
    if (!info.exists) {
      return { success: false, message: 'Database file not found.' };
    }

    try {
      const base64 = await readDatabaseBase64();
      const fileName = backupFileName(dateKey);
      const keepUri = await writeBase64FileToSaf(
        folderUri,
        fileName,
        'application/octet-stream',
        base64
      );
      await removeBackupForDate(folderUri, dateKey, keepUri);

      const removed = await cleanupOldBackups(folderUri);
      const retentionNote =
        removed > 0
          ? ` Removed ${removed} backup${removed === 1 ? '' : 's'} older than ${RETENTION_DAYS} days.`
          : '';

      return { success: true, message: `Backup saved as ${fileName}.${retentionNote}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Backup failed' };
    }
  });

  try {
    return await backupInFlight.current;
  } finally {
    backupInFlight.current = null;
  }
}

/** Manual "Back up now": write today's backup to the chosen folder. */
export async function backupDatabase(): Promise<{ success: boolean; message: string }> {
  const folderUri = await getBackupFolderUri();
  if (!folderUri) {
    return { success: false, message: 'No backup folder selected. Go to Settings.' };
  }

  const guard = await getBackupSafetyGuard();
  if (guard.blocked) {
    return { success: false, message: guard.message ?? 'Backup blocked.' };
  }

  const result = await writeBackupToFolder(folderUri, todayDateKey());
  if (result.success) {
    await recordBackupSuccess();
  } else {
    await recordBackupError(result.message);
  }
  return result;
}

/** Run a backup if auto-backup is on and a folder is configured. */
export async function runAutoBackup(): Promise<{ ran: boolean; message?: string }> {
  const enabled = await isAutoBackupEnabled();
  const folderUri = await getBackupFolderUri();
  if (!enabled || !folderUri) return { ran: false };

  const guard = await getBackupSafetyGuard();
  if (guard.blocked) return { ran: false, message: guard.message };

  const result = await writeBackupToFolder(folderUri, todayDateKey());
  if (result.success) {
    await recordBackupSuccess();
    return { ran: true, message: result.message };
  }
  await recordBackupError(result.message);
  return { ran: false, message: result.message };
}

/** Back up once per calendar day (used on app launch). */
export async function runDailyBackupIfDue(): Promise<{ ran: boolean; message?: string }> {
  const enabled = await isAutoBackupEnabled();
  const folderUri = await getBackupFolderUri();
  if (!enabled || !folderUri) return { ran: false };

  const today = todayDateKey();
  if ((await getLastDailyBackupDate()) === today) return { ran: false };

  return runAutoBackup();
}

/** Back up the current session's work when the app goes to the background. */
export async function backupOnBackground(): Promise<void> {
  const enabled = await isAutoBackupEnabled();
  const folderUri = await getBackupFolderUri();
  if (!enabled || !folderUri) return;
  await runAutoBackup();
}

// --- Export (share a copy) -------------------------------------------------

/** Share a plain copy of the database file via the system share sheet. */
export async function exportDatabase(): Promise<{ success: boolean; message: string }> {
  const info = await FileSystem.getInfoAsync(getDbPath());
  if (!info.exists) {
    return { success: false, message: 'Database file not found.' };
  }

  try {
    return await withDatabaseBackup(async () => {
      const base64 = await readDatabaseBase64();
      const exportPath = `${FileSystem.cacheDirectory}${backupFileName(todayDateKey())}`;
      await FileSystem.writeAsStringAsync(exportPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!(await Sharing.isAvailableAsync())) {
        await FileSystem.deleteAsync(exportPath, { idempotent: true });
        return { success: false, message: 'Sharing is not available on this device.' };
      }

      await Sharing.shareAsync(exportPath, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Export Hisab database',
      });
      await FileSystem.deleteAsync(exportPath, { idempotent: true });
      return { success: true, message: 'Database exported.' };
    });
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Export failed' };
  }
}

// --- Import (restore) ------------------------------------------------------

/** Open the system file picker and return the chosen backup file (or null if cancelled). */
export async function pickBackupFile(): Promise<PickedBackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/x-sqlite3', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return { uri: result.assets[0].uri, name: result.assets[0].name };
}

/** Open the (freshly restored) DB and verify it is a healthy Hisab database. */
async function validateRestoredDatabase(): Promise<void> {
  await invalidateDatabase();
  const db = await getDatabase();

  const integrity = await db.getFirstAsync<Record<string, string>>('PRAGMA integrity_check;');
  const verdict = integrity ? String(Object.values(integrity)[0] ?? '') : '';
  if (verdict.toLowerCase() !== 'ok') {
    throw new Error('The backup file failed the database integrity check.');
  }
  await db.getFirstAsync('SELECT id FROM accounts LIMIT 1');
}

/** Restore the newest backup from the configured backup folder. */
export async function restoreLatestFromBackupFolder(): Promise<{ success: boolean; message: string }> {
  try {
    const folderUri = await getBackupFolderUri();
    if (!folderUri) {
      return { success: false, message: 'No backup folder selected. Set it in Settings first.' };
    }
    if (!isSafUri(folderUri)) {
      await AsyncStorage.removeItem(BACKUP_FOLDER_KEY);
      return {
        success: false,
        message: 'Backup folder access expired. Open Settings and choose the backup folder again.',
      };
    }

    const files = await listBackupFiles(folderUri);
    files.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    if (files.length === 0) {
      return { success: false, message: 'No backup files found in the configured folder.' };
    }

    const latest = files[0];
    return restoreDatabaseFromUri(latest.uri, backupFileName(latest.dateKey));
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Restore from backup folder failed.',
    };
  }
}

export async function restoreDatabaseFromUri(
  sourceUri: string,
  label: string
): Promise<{ success: boolean; message: string }> {
  return withDatabaseRestore(async () => {
    let dbBase64: string;
    try {
      dbBase64 = await FileSystem.readAsStringAsync(sourceUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? `Could not read backup file: ${error.message}`
            : 'Could not read backup file.',
      };
    }

    if (!isSqliteDatabaseBase64(dbBase64)) {
      return { success: false, message: 'That file is not a Hisab backup (.db).' };
    }

    const dbPath = getDbPath();
    const preRestorePath = `${FileSystem.cacheDirectory}hisab-pre-restore.db`;

    let havePreRestore = false;
    const info = await FileSystem.getInfoAsync(dbPath);
    if (info.exists) {
      try {
        await checkpointDatabase({ strict: false });
      } catch {
        // Still snapshot whatever is on disk — strict checkpoint must not block restore.
      }
      await FileSystem.deleteAsync(preRestorePath, { idempotent: true });
      await FileSystem.copyAsync({ from: dbPath, to: preRestorePath });
      havePreRestore = true;
    }

    await closeDatabase();
    try {
      await writeDatabaseFromBase64(dbBase64);
      await validateRestoredDatabase();

      await FileSystem.deleteAsync(preRestorePath, { idempotent: true });
      await clearAutoBackupPause();

      return { success: true, message: `Imported from ${label}.` };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Restore failed';
      if (!havePreRestore) {
        return { success: false, message: reason };
      }
      try {
        await closeDatabase();
        await writeDatabaseFromBase64(
          await FileSystem.readAsStringAsync(preRestorePath, {
            encoding: FileSystem.EncodingType.Base64,
          })
        );
        await invalidateDatabase();
        await getDatabase();
        return { success: false, message: `${reason} Your previous data was restored unchanged.` };
      } catch {
        return {
          success: false,
          message: `${reason} Automatic recovery also failed — restart the app; a snapshot is kept at ${preRestorePath}.`,
        };
      }
    }
  });
}

export async function restoreDatabaseFromBackup(): Promise<{ success: boolean; message: string }> {
  try {
    const picked = await pickBackupFile();
    if (!picked) {
      return { success: false, message: 'Import cancelled' };
    }
    return await restoreDatabaseFromUri(picked.uri, picked.name);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Import failed' };
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parse, parseISO, subDays } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { checkpointDatabase, closeDatabase, DB_NAME, getDatabase } from '../db/database';

export interface PickedBackupFile {
  uri: string;
  name: string;
}

const BACKUP_FOLDER_KEY = '@hisab_backup_folder';
const AUTO_BACKUP_KEY = '@hisab_auto_backup';
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
  const value = await AsyncStorage.getItem(AUTO_BACKUP_KEY);
  return value !== 'false';
}

export async function setAutoBackupEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(AUTO_BACKUP_KEY, enabled ? 'true' : 'false');
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

export async function pickBackupFolder(): Promise<string | null> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return null;
  await setBackupFolderUri(permissions.directoryUri);
  return permissions.directoryUri;
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
  const match = name.match(/hisab-backup-(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function nameFromSafUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const segment = decoded.split('/').pop() ?? '';
  return segment.includes(':') ? segment.split(':').pop() ?? segment : segment;
}

function isSqliteDatabaseBase64(base64: string): boolean {
  try {
    const header = atob(base64.slice(0, 24));
    return header.startsWith('SQLite format 3');
  } catch {
    return false;
  }
}

async function listBackupFiles(
  folderUri: string
): Promise<{ uri: string; dateKey: string }[]> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
  const files: { uri: string; dateKey: string }[] = [];

  for (const uri of entries) {
    const dateKey = parseDateKeyFromName(nameFromSafUri(uri));
    if (dateKey) {
      files.push({ uri, dateKey });
    }
  }

  return files;
}

async function deleteBackupFile(uri: string): Promise<void> {
  await FileSystem.StorageAccessFramework.deleteAsync(uri, { idempotent: true });
}

export async function cleanupOldBackups(folderUri: string): Promise<number> {
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

async function removeBackupForDate(
  folderUri: string,
  dateKey: string,
  keepUri?: string
): Promise<void> {
  const files = await listBackupFiles(folderUri);
  for (const file of files) {
    if (file.dateKey === dateKey && file.uri !== keepUri) {
      await deleteBackupFile(file.uri);
    }
  }
}

/** Read the live database file as base64, after folding WAL data into it. */
async function readDatabaseBase64(): Promise<string> {
  // A backup taken after a failed checkpoint would silently miss the newest
  // transactions, so fail loudly instead.
  await checkpointDatabase({ strict: true });
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

// --- Backup to folder ------------------------------------------------------

// Serialize backups so the daily and app-lifecycle backups can't overlap and
// race on the same file in the SAF folder.
let backupInFlight: Promise<{ success: boolean; message: string }> | null = null;

async function writeBackupToFolder(
  folderUri: string,
  dateKey: string
): Promise<{ success: boolean; message: string }> {
  if (backupInFlight) return backupInFlight;
  backupInFlight = (async () => {
    const info = await FileSystem.getInfoAsync(getDbPath());
    if (!info.exists) {
      return { success: false, message: 'Database file not found.' };
    }

    try {
      const base64 = await readDatabaseBase64();

      // Write the new file first, then remove any prior file for the same day,
      // so an interrupted backup never destroys the previous good copy.
      const fileName = backupFileName(dateKey);
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        folderUri,
        fileName,
        'application/octet-stream'
      );
      await FileSystem.writeAsStringAsync(destUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await removeBackupForDate(folderUri, dateKey, destUri);

      const removed = await cleanupOldBackups(folderUri);
      const retentionNote =
        removed > 0
          ? ` Removed ${removed} backup${removed === 1 ? '' : 's'} older than ${RETENTION_DAYS} days.`
          : '';

      return { success: true, message: `Backup saved as ${fileName}.${retentionNote}` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Backup failed',
      };
    }
  })();

  try {
    return await backupInFlight;
  } finally {
    backupInFlight = null;
  }
}

/** Manual "Back up now": write today's backup to the chosen folder. */
export async function backupDatabase(): Promise<{ success: boolean; message: string }> {
  const folderUri = await getBackupFolderUri();
  if (!folderUri) {
    return { success: false, message: 'No backup folder selected. Go to Settings.' };
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
  if (!enabled || !folderUri) {
    return { ran: false };
  }

  const result = await writeBackupToFolder(folderUri, todayDateKey());
  if (result.success) {
    await recordBackupSuccess();
    return { ran: true, message: result.message };
  }

  await recordBackupError(result.message);
  return { ran: false, message: result.message };
}

/** Back up once per calendar day (used on app launch / when app becomes active). */
export async function runDailyBackupIfDue(): Promise<{ ran: boolean; message?: string }> {
  const enabled = await isAutoBackupEnabled();
  const folderUri = await getBackupFolderUri();
  if (!enabled || !folderUri) {
    return { ran: false };
  }

  const today = todayDateKey();
  const last = await getLastDailyBackupDate();
  if (last === today) {
    return { ran: false };
  }

  return runAutoBackup();
}

/**
 * Back up the current session's work (used when the app goes to the background).
 * Always overwrites today's file so the day's latest changes are captured,
 * without needing a backup after every single save.
 */
export async function backupOnBackground(): Promise<void> {
  const enabled = await isAutoBackupEnabled();
  const folderUri = await getBackupFolderUri();
  if (!enabled || !folderUri) return;
  await runAutoBackup();
}

// --- Export (share a copy) -------------------------------------------------

/** Create a copy of the database and open the system share sheet to save it anywhere. */
export async function exportDatabase(): Promise<{ success: boolean; message: string }> {
  const info = await FileSystem.getInfoAsync(getDbPath());
  if (!info.exists) {
    return { success: false, message: 'Database file not found.' };
  }

  try {
    const base64 = await readDatabaseBase64();
    const fileName = backupFileName(todayDateKey());
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!(await Sharing.isAvailableAsync())) {
      return { success: false, message: 'Sharing is not available on this device.' };
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Export Hisab backup',
    });
    return { success: true, message: 'Backup exported.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

// --- Import (restore) ------------------------------------------------------

/** Open the system file picker and return the chosen backup file (or null if cancelled). */
export async function pickBackupFile(): Promise<PickedBackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return { uri: result.assets[0].uri, name: result.assets[0].name };
}

/** Open the (freshly restored) DB and verify it is a healthy Hisab database. */
async function validateRestoredDatabase(): Promise<void> {
  // getDatabase runs schema verification/migrations and throws on a bad schema.
  const db = await getDatabase();

  const integrity = await db.getFirstAsync<Record<string, string>>('PRAGMA integrity_check;');
  const verdict = integrity ? String(Object.values(integrity)[0] ?? '') : '';
  if (verdict.toLowerCase() !== 'ok') {
    throw new Error('The backup file failed the database integrity check.');
  }

  // Probe a core table to make sure this is actually a Hisab database.
  await db.getFirstAsync('SELECT id FROM accounts LIMIT 1');
}

export async function restoreDatabaseFromUri(
  sourceUri: string,
  label: string
): Promise<{ success: boolean; message: string }> {
  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!isSqliteDatabaseBase64(base64)) {
    return { success: false, message: 'That file is not a Hisab backup.' };
  }

  const dbPath = getDbPath();
  const preRestorePath = `${FileSystem.cacheDirectory}hisab-pre-restore.db`;

  // Snapshot the live database first so a corrupt backup can't destroy it.
  let havePreRestore = false;
  const info = await FileSystem.getInfoAsync(dbPath);
  if (info.exists) {
    await checkpointDatabase();
    await FileSystem.deleteAsync(preRestorePath, { idempotent: true });
    await FileSystem.copyAsync({ from: dbPath, to: preRestorePath });
    havePreRestore = true;
  }

  await closeDatabase();
  try {
    await writeDatabaseFromBase64(base64);
    await validateRestoredDatabase();
    await FileSystem.deleteAsync(preRestorePath, { idempotent: true });
    return { success: true, message: `Imported from ${label}` };
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
      await getDatabase();
      return {
        success: false,
        message: `${reason} Your previous data was restored unchanged.`,
      };
    } catch {
      return {
        success: false,
        message: `${reason} Automatic recovery also failed — restart the app; a snapshot is kept at ${preRestorePath}.`,
      };
    }
  }
}

export async function restoreDatabaseFromBackup(): Promise<{ success: boolean; message: string }> {
  try {
    const picked = await pickBackupFile();
    if (!picked) {
      return { success: false, message: 'Import cancelled' };
    }
    return await restoreDatabaseFromUri(picked.uri, picked.name);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Import failed',
    };
  }
}

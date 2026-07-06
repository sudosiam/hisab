import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parse, parseISO, subDays } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { checkpointDatabase, closeDatabase, DB_NAME, databaseHasUserData, getDatabase, invalidateDatabase } from '../db/database';
import { getAllAttachments, getAttachmentFileUri, MEDIA_ROOT, clearAllLocalMedia } from './attachments';
import { withDbMaintenanceLock } from './dbMaintenance';
import {
  buildFullBackupZipFromDb,
  extractFullBackupZipFromBase64,
  fullBackupZipName,
  isZipBackupBase64,
  writeExtractedMediaToLocal,
} from './backupArchive';

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
const BACKUP_DB_DIR = 'database';
const BACKUP_MEDIA_DIR = 'media';
const BACKUP_FULL_DIR = 'full';

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
  return value === 'true';
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

/** Prevent empty or post-reset databases from overwriting real backups. */
async function getBackupSafetyGuard(
  _folderUri: string | null
): Promise<{ blocked: boolean; message?: string }> {
  try {
    if (await isAutoBackupPaused()) {
      return {
        blocked: true,
        message:
          'Backup is paused after reset. Restore from your backup folder first, then turn auto backup back on.',
      };
    }

    // Never touch Google Drive / SAF on startup — stale URIs can crash Android natively.
    if (!(await databaseHasUserData())) {
      return {
        blocked: true,
        message:
          'Database has no data yet. Backup skipped — restore from backup or add data first.',
      };
    }

    return { blocked: false };
  } catch {
    return { blocked: true, message: 'Backup skipped due to a temporary error.' };
  }
}

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
  await initializeBackupFolderStructure(permissions.directoryUri);
  return permissions.directoryUri;
}

function nameFromSafUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const segment = decoded.split('/').filter(Boolean).pop() ?? '';
  const name = segment.includes(':') ? segment.split(':').pop() ?? segment : segment;
  return name.trim();
}

function safNameMatchesDir(safName: string, dirName: string): boolean {
  const saf = safName.toLowerCase();
  const target = dirName.toLowerCase();
  if (saf === target) return true;
  const duplicatePattern = new RegExp(`^${escapeRegExp(target)}(?: \\(\\d+\\))?$`, 'i');
  return duplicatePattern.test(saf);
}

async function safDirEntryCount(dirUri: string): Promise<number> {
  const entries = await safReadDirectory(dirUri);
  return entries.length;
}

async function isSafDirEmpty(dirUri: string): Promise<boolean> {
  const count = await safDirEntryCount(dirUri);
  return count === 0;
}

async function findSafChildDirs(parentUri: string, dirName: string): Promise<string[]> {
  if (!isSafUri(parentUri)) return [];
  const entries = await safReadDirectory(parentUri);
  return entries.filter((uri) => safNameMatchesDir(nameFromSafUri(uri), dirName));
}

async function pickBestSafChildDir(dirName: string, matches: string[]): Promise<string> {
  if (matches.length === 1) return matches[0];

  const exactMatches = matches.filter(
    (uri) => nameFromSafUri(uri).toLowerCase() === dirName.toLowerCase()
  );
  const candidates = exactMatches.length > 0 ? exactMatches : matches;

  let best = candidates[0];
  let bestCount = -1;
  for (const uri of candidates) {
    const count = await safDirEntryCount(uri);
    if (count > bestCount) {
      bestCount = count;
      best = uri;
    }
  }
  return best;
}

async function cleanupDuplicateSafDirs(
  parentUri: string,
  dirName: string,
  keepUri: string
): Promise<number> {
  const matches = await findSafChildDirs(parentUri, dirName);
  let removed = 0;
  for (const uri of matches) {
    if (uri === keepUri) continue;
    if (!(await isSafDirEmpty(uri))) continue;
    try {
      await FileSystem.StorageAccessFramework.deleteAsync(uri, { idempotent: true });
      removed += 1;
    } catch {
      // Non-empty or provider blocked deletion — leave it for manual cleanup.
    }
  }
  return removed;
}

async function findSafChildDir(parentUri: string, dirName: string): Promise<string | null> {
  const matches = await findSafChildDirs(parentUri, dirName);
  if (matches.length === 0) return null;
  return pickBestSafChildDir(dirName, matches);
}

async function ensureSafSubdir(parentUri: string, dirName: string): Promise<string> {
  if (!isSafUri(parentUri)) {
    throw new Error('Backup folder access expired. Re-select the folder in Settings.');
  }
  const matches = await findSafChildDirs(parentUri, dirName);
  if (matches.length > 0) {
    const primary = await pickBestSafChildDir(dirName, matches);
    await cleanupDuplicateSafDirs(parentUri, dirName, primary);
    return primary;
  }
  return FileSystem.StorageAccessFramework.makeDirectoryAsync(parentUri, dirName);
}

async function dedupeBackupFolderStructure(rootUri: string): Promise<void> {
  if (!isSafUri(rootUri)) return;
  for (const dirName of [BACKUP_DB_DIR, BACKUP_MEDIA_DIR, BACKUP_FULL_DIR]) {
    const primary = await findSafChildDir(rootUri, dirName);
    if (primary) {
      await cleanupDuplicateSafDirs(rootUri, dirName, primary);
    }
  }
}

/** Creates database/ and full/ under the chosen backup folder. Reuses existing folders. */
export async function initializeBackupFolderStructure(rootUri: string): Promise<{
  databaseUri: string;
  mediaUri: string | null;
  fullUri: string;
}> {
  if (!isSafUri(rootUri)) {
    throw new Error('Backup folder access expired. Re-select the folder in Settings.');
  }
  await dedupeBackupFolderStructure(rootUri);
  const databaseUri = await ensureSafSubdir(rootUri, BACKUP_DB_DIR);
  const fullUri = await ensureSafSubdir(rootUri, BACKUP_FULL_DIR);
  // Legacy media/ — reuse if present; auto backup no longer writes here.
  const mediaUri = await findSafChildDir(rootUri, BACKUP_MEDIA_DIR);
  return { databaseUri, mediaUri, fullUri };
}

async function resolveBackupDatabaseDir(folderUri: string): Promise<string> {
  const { databaseUri } = await initializeBackupFolderStructure(folderUri);
  return databaseUri;
}

async function resolveBackupMediaDir(folderUri: string): Promise<string> {
  const existing = await findSafChildDir(folderUri, BACKUP_MEDIA_DIR);
  if (existing) return existing;
  const mediaUri = await ensureSafSubdir(folderUri, BACKUP_MEDIA_DIR);
  await ensureSafSubdir(mediaUri, 'sales');
  await ensureSafSubdir(mediaUri, 'purchases');
  return mediaUri;
}

async function ensureSafParentForRelativePath(rootMediaUri: string, relativePath: string): Promise<string> {
  const parts = relativePath.split('/');
  const fileName = parts.pop();
  if (!fileName) return rootMediaUri;
  let parent = rootMediaUri;
  for (const part of parts) {
    parent = await ensureSafSubdir(parent, part);
  }
  return parent;
}

async function writeLocalFileToSaf(
  localUri: string,
  safDirUri: string,
  fileName: string,
  mimeType: string
): Promise<void> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await writeBase64FileToSaf(safDirUri, fileName, mimeType, base64);
}

async function syncMediaToBackup(mediaRootUri: string): Promise<{ copied: number; missing: number }> {
  const attachments = await getAllAttachments();
  let copied = 0;
  let missing = 0;

  for (const attachment of attachments) {
    const localUri = getAttachmentFileUri(attachment.storage_path);
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      missing += 1;
      continue;
    }

    const fileName = attachment.storage_path.split('/').pop();
    if (!fileName) continue;

    const safDir = await ensureSafParentForRelativePath(mediaRootUri, attachment.storage_path);
    await writeLocalFileToSaf(localUri, safDir, fileName, attachment.mime_type);
    copied += 1;
  }

  return { copied, missing };
}

/** Sync attachments to the configured backup folder (database unchanged). */
export async function syncAttachmentsToBackupFolder(
  folderUri: string
): Promise<{ copied: number; missing?: number; message?: string }> {
  try {
    const mediaUri = await resolveBackupMediaDir(folderUri);
    const result = await syncMediaToBackup(mediaUri);
    return { copied: result.copied, missing: result.missing };
  } catch (error) {
    return {
      copied: 0,
      message: error instanceof Error ? error.message : 'Attachment sync failed',
    };
  }
}

/** Ensure backup subfolders exist for folders selected before the media feature. */
export async function ensureBackupFolderReady(folderUri: string): Promise<void> {
  await initializeBackupFolderStructure(folderUri);
}

/** Restore sale/purchase media from the configured backup folder after a DB import. */
export async function restoreMediaFromBackupFolder(folderUri: string): Promise<number> {
  const mediaRoot = await findSafChildDir(folderUri, BACKUP_MEDIA_DIR);
  if (!mediaRoot) return 0;

  const attachments = await getAllAttachments();
  let restored = 0;

  for (const attachment of attachments) {
    const fileName = attachment.storage_path.split('/').pop();
    if (!fileName) continue;

    const safDir = await ensureSafParentForRelativePath(mediaRoot, attachment.storage_path);
    const safFileUri = await findSafFileInDir(safDir, fileName);
    if (!safFileUri) continue;

    const relativeDir = attachment.storage_path.split('/').slice(0, -1).join('/');
    const localDir = `${MEDIA_ROOT}${relativeDir}`;
    const dirInfo = await FileSystem.getInfoAsync(localDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
    }

    const localUri = getAttachmentFileUri(attachment.storage_path);
    const base64 = await FileSystem.readAsStringAsync(safFileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    restored += 1;
  }

  return restored;
}

/** Restore attachments from the newest full zip when legacy media/ folder is empty. */
async function restoreMediaFromLatestFullZip(folderUri: string): Promise<number> {
  const files = await listFullBackupFiles(folderUri);
  if (files.length === 0) return 0;

  files.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const latest = files[0];

  try {
    const base64 = await FileSystem.readAsStringAsync(latest.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const extracted = await extractFullBackupZipFromBase64(base64);
    return writeExtractedMediaToLocal(extracted.mediaFiles);
  } catch {
    return 0;
  }
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
  const match = name.match(/hisab-(?:backup|full)-(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function backupBaseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '') || fileName;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match SAF display names including Drive-style duplicates like "uuid (1).jpg". */
function safNameMatchesBackupFile(safName: string, fileName: string): boolean {
  const saf = safName.toLowerCase();
  const target = fileName.toLowerCase();
  if (saf === target) return true;

  const base = backupBaseName(fileName).toLowerCase();
  if (saf === base) return true;

  // Drive may store without extension (createFileAsync uses baseName only).
  const targetBase = backupBaseName(target);
  if (saf === targetBase) return true;

  const duplicatePattern = new RegExp(
    `^${escapeRegExp(base)}(?: \\(\\d+\\))?(?:\\.[^.]+)?$`,
    'i'
  );
  return duplicatePattern.test(saf);
}

async function writeBase64FileToSaf(
  safDirUri: string,
  fileName: string,
  mimeType: string,
  base64: string
): Promise<string> {
  const existingFiles = await findSafFilesInDir(safDirUri, fileName);
  if (existingFiles.length > 0) {
    const primary =
      (await findSafFileInDir(safDirUri, fileName)) ?? existingFiles[0];
    await FileSystem.writeAsStringAsync(primary, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    for (const uri of existingFiles) {
      if (uri !== primary) {
        await FileSystem.StorageAccessFramework.deleteAsync(uri, { idempotent: true });
      }
    }
    return primary;
  }

  const baseName = backupBaseName(fileName) || 'file';
  const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
    safDirUri,
    baseName,
    mimeType
  );
  await FileSystem.writeAsStringAsync(destUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return destUri;
}

async function findSafFilesInDir(dirUri: string, fileName: string): Promise<string[]> {
  const entries = await safReadDirectory(dirUri);
  return entries.filter((uri) => safNameMatchesBackupFile(nameFromSafUri(uri), fileName));
}

async function findSafFileInDir(dirUri: string, fileName: string): Promise<string | null> {
  const matches = await findSafFilesInDir(dirUri, fileName);
  if (matches.length === 0) return null;

  const exact = matches.find(
    (uri) => nameFromSafUri(uri).toLowerCase() === fileName.toLowerCase()
  );
  if (exact) return exact;

  const base = backupBaseName(fileName).toLowerCase();
  const baseMatch = matches.find((uri) => nameFromSafUri(uri).toLowerCase() === base);
  return baseMatch ?? matches[0];
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
  if (!isSafUri(folderUri)) return [];
  const dbDir = (await findSafChildDir(folderUri, BACKUP_DB_DIR)) ?? folderUri;
  const entries = await safReadDirectory(dbDir);
  const files: { uri: string; dateKey: string }[] = [];

  for (const uri of entries) {
    const dateKey = parseDateKeyFromName(nameFromSafUri(uri));
    if (dateKey) {
      files.push({ uri, dateKey });
    }
  }

  return files;
}

async function listFullBackupFiles(
  folderUri: string
): Promise<{ uri: string; dateKey: string }[]> {
  if (!isSafUri(folderUri)) return [];
  const fullDir = await findSafChildDir(folderUri, BACKUP_FULL_DIR);
  if (!fullDir) return [];
  const entries = await safReadDirectory(fullDir);
  const files: { uri: string; dateKey: string }[] = [];

  for (const uri of entries) {
    const dateKey = parseDateKeyFromName(nameFromSafUri(uri));
    if (dateKey) {
      files.push({ uri, dateKey });
    }
  }

  return files;
}

async function removeFullBackupForDate(
  folderUri: string,
  dateKey: string,
  keepUri?: string
): Promise<void> {
  const files = await listFullBackupFiles(folderUri);
  for (const file of files) {
    if (file.dateKey === dateKey && file.uri !== keepUri) {
      await deleteBackupFile(file.uri);
    }
  }
  // Also remove stray duplicates that share today's date in the filename.
  const fullDir = await findSafChildDir(folderUri, BACKUP_FULL_DIR);
  if (!fullDir) return;
  const fileName = fullBackupZipName(dateKey);
  const dupes = await findSafFilesInDir(fullDir, fileName);
  for (const uri of dupes) {
    if (uri !== keepUri) {
      await deleteBackupFile(uri);
    }
  }
}

async function writeDbBackupToSaf(
  folderUri: string,
  databaseUri: string,
  dateKey: string,
  base64: string
): Promise<void> {
  const fileName = backupFileName(dateKey);
  const keepUri = await writeBase64FileToSaf(
    databaseUri,
    fileName,
    'application/octet-stream',
    base64
  );
  await removeBackupForDate(folderUri, dateKey, keepUri);
}

async function writeFullBackupZipToSaf(
  folderUri: string,
  dateKey: string,
  zipPath: string
): Promise<void> {
  const fullDir = (await initializeBackupFolderStructure(folderUri)).fullUri;
  const fileName = fullBackupZipName(dateKey);
  const zipBase64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const keepUri = await writeBase64FileToSaf(fullDir, fileName, 'application/zip', zipBase64);
  await removeFullBackupForDate(folderUri, dateKey, keepUri);
}

async function cleanupOldFullBackups(folderUri: string): Promise<number> {
  const cutoff = format(subDays(new Date(), RETENTION_DAYS), 'yyyy-MM-dd');
  const files = await listFullBackupFiles(folderUri);
  let removed = 0;

  for (const file of files) {
    if (file.dateKey < cutoff) {
      await deleteBackupFile(file.uri);
      removed += 1;
    }
  }

  return removed;
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

  removed += await cleanupOldFullBackups(folderUri);
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
  const dbDir = await findSafChildDir(folderUri, BACKUP_DB_DIR);
  if (!dbDir) return;
  const fileName = backupFileName(dateKey);
  const dupes = await findSafFilesInDir(dbDir, fileName);
  for (const uri of dupes) {
    if (uri !== keepUri) {
      await deleteBackupFile(uri);
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
  backupInFlight = withDbMaintenanceLock(async () => {
    const info = await FileSystem.getInfoAsync(getDbPath());
    if (!info.exists) {
      return { success: false, message: 'Database file not found.' };
    }

    try {
      await dedupeBackupFolderStructure(folderUri);
      const base64 = await readDatabaseBase64();
      const databaseUri = await resolveBackupDatabaseDir(folderUri);
      const fileName = backupFileName(dateKey);

      await writeDbBackupToSaf(folderUri, databaseUri, dateKey, base64);

      const removed = await cleanupOldBackups(folderUri);
      const retentionNote =
        removed > 0
          ? ` Removed ${removed} backup${removed === 1 ? '' : 's'} older than ${RETENTION_DAYS} days.`
          : '';

      let zipNote = '';
      try {
        const zip = await buildFullBackupZipFromDb(dateKey, base64);
        await writeFullBackupZipToSaf(folderUri, dateKey, zip.zipPath);
        await FileSystem.deleteAsync(zip.zipPath, { idempotent: true });
        zipNote = ` Full zip includes ${zip.attachmentCount} attachment${zip.attachmentCount === 1 ? '' : 's'}.`;
        if (zip.missing > 0) {
          zipNote += ` ${zip.missing} missing locally.`;
        }
      } catch (error) {
        zipNote =
          error instanceof Error
            ? ` Full zip failed: ${error.message}`
            : ' Full zip could not be created.';
        await recordBackupError(zipNote.trim());
      }

      return {
        success: true,
        message: `Backup saved as database/${fileName}.${retentionNote}${zipNote}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Backup failed',
      };
    }
  });

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

  const guard = await getBackupSafetyGuard(folderUri);
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
  if (!enabled || !folderUri) {
    return { ran: false };
  }

  const guard = await getBackupSafetyGuard(folderUri);
  if (guard.blocked) {
    return { ran: false, message: guard.message };
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
    // Refresh today's DB backup and sync attachments (not media-only).
    return runAutoBackup();
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

/** Create a full backup zip (database + attachments) and open the share sheet. */
export async function exportDatabase(): Promise<{ success: boolean; message: string }> {
  const info = await FileSystem.getInfoAsync(getDbPath());
  if (!info.exists) {
    return { success: false, message: 'Database file not found.' };
  }

  try {
    return await withDbMaintenanceLock(async () => {
      const dateKey = todayDateKey();
      const dbBase64 = await readDatabaseBase64();
      const { zipPath, attachmentCount, missing } = await buildFullBackupZipFromDb(
        dateKey,
        dbBase64
      );

      if (!(await Sharing.isAvailableAsync())) {
        await FileSystem.deleteAsync(zipPath, { idempotent: true });
        return { success: false, message: 'Sharing is not available on this device.' };
      }

      await Sharing.shareAsync(zipPath, {
        mimeType: 'application/zip',
        dialogTitle: 'Export Hisab backup',
      });
      await FileSystem.deleteAsync(zipPath, { idempotent: true });

      let message = `Exported database + ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}.`;
      if (missing > 0) {
        message += ` ${missing} attachment file(s) were missing locally.`;
      }
      return { success: true, message };
    });
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
    type: ['application/zip', 'application/x-sqlite3', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
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

async function restoreMediaAfterDbImport(
  zipMedia: { relativePath: string; base64: string }[],
  isZip: boolean
): Promise<{ restored: number; note: string }> {
  try {
    await clearLocalMediaBeforeRestore();
    let mediaRestored = 0;
    if (zipMedia.length > 0) {
      mediaRestored = await writeExtractedMediaToLocal(zipMedia);
    } else {
      const folderUri = await getBackupFolderUri();
      if (folderUri) {
        mediaRestored = await restoreMediaFromBackupFolder(folderUri);
        if (mediaRestored === 0) {
          mediaRestored = await restoreMediaFromLatestFullZip(folderUri);
        }
      }
    }

    if (mediaRestored > 0) {
      return {
        restored: mediaRestored,
        note: ` Restored ${mediaRestored} attachment${mediaRestored === 1 ? '' : 's'}.`,
      };
    }
    if (isZip) {
      return { restored: 0, note: '' };
    }
    if (await getBackupFolderUri()) {
      return { restored: 0, note: '' };
    }
    return {
      restored: 0,
      note: ' Attachments were not restored — import a full zip or set the same backup folder in Settings.',
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    return {
      restored: 0,
      note: ` Database restored, but attachments failed: ${detail}`,
    };
  }
}

/** Restore the newest backup from the configured backup folder (full zip preferred). */
export async function restoreLatestFromBackupFolder(): Promise<{ success: boolean; message: string }> {
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

  const fullFiles = await listFullBackupFiles(folderUri);
  fullFiles.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  if (fullFiles.length > 0) {
    const latest = fullFiles[0];
    return restoreDatabaseFromUri(latest.uri, fullBackupZipName(latest.dateKey));
  }

  const dbFiles = await listBackupFiles(folderUri);
  dbFiles.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  if (dbFiles.length > 0) {
    const latest = dbFiles[0];
    return restoreDatabaseFromUri(latest.uri, backupFileName(latest.dateKey));
  }

  return { success: false, message: 'No backup files found in the configured folder.' };
}

async function clearLocalMediaBeforeRestore(): Promise<void> {
  await clearAllLocalMedia();
}

export async function restoreDatabaseFromUri(
  sourceUri: string,
  label: string
): Promise<{ success: boolean; message: string }> {
  return withDbMaintenanceLock(async () => {
    const rawBase64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const isZip =
      isZipBackupBase64(rawBase64) || label.toLowerCase().endsWith('.zip');

    let dbBase64 = rawBase64;
    let zipMedia: { relativePath: string; base64: string }[] = [];

    if (isZip) {
      const extracted = await extractFullBackupZipFromBase64(rawBase64);
      dbBase64 = extracted.dbBase64;
      zipMedia = extracted.mediaFiles;
      label = extracted.dbLabel;
    } else if (!isSqliteDatabaseBase64(rawBase64)) {
      return { success: false, message: 'That file is not a Hisab backup.' };
    }

    if (!isSqliteDatabaseBase64(dbBase64)) {
      return { success: false, message: 'That file is not a Hisab backup.' };
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

      const { note: mediaNote } = await restoreMediaAfterDbImport(zipMedia, isZip);
      await FileSystem.deleteAsync(preRestorePath, { idempotent: true });
      await clearAutoBackupPause();

      return { success: true, message: `Imported from ${label}.${mediaNote}` };
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
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Import failed',
    };
  }
}

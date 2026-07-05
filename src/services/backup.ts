import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, subDays } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { closeDatabase, DB_NAME, getDatabase } from '../db/database';

const BACKUP_FOLDER_KEY = '@hisab_backup_folder';
const AUTO_BACKUP_KEY = '@hisab_auto_backup';
const LAST_DAILY_BACKUP_KEY = '@hisab_last_daily_backup';
const BACKUP_PREFIX = 'hisab-backup-';

export const RETENTION_DAYS = 30;

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

export async function getLastDailyBackupDate(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_DAILY_BACKUP_KEY);
}

export async function pickBackupFolder(): Promise<string | null> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return null;
  await setBackupFolderUri(permissions.directoryUri);
  return permissions.directoryUri;
}

function getDbPath(): string {
  return `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
}

function todayDateKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function backupBaseName(dateKey: string): string {
  return `${BACKUP_PREFIX}${dateKey}`;
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

async function listBackupFiles(
  folderUri: string
): Promise<Array<{ uri: string; dateKey: string }>> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
  const files: Array<{ uri: string; dateKey: string }> = [];

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

async function removeBackupForDate(folderUri: string, dateKey: string): Promise<void> {
  const files = await listBackupFiles(folderUri);
  for (const file of files) {
    if (file.dateKey === dateKey) {
      await deleteBackupFile(file.uri);
    }
  }
}

async function writeBackupToFolder(
  folderUri: string,
  dateKey: string
): Promise<{ success: boolean; message: string }> {
  const dbPath = getDbPath();
  const info = await FileSystem.getInfoAsync(dbPath);
  if (!info.exists) {
    return { success: false, message: 'Database file not found.' };
  }

  try {
    const baseName = backupBaseName(dateKey);
    await removeBackupForDate(folderUri, dateKey);

    const base64 = await FileSystem.readAsStringAsync(dbPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      folderUri,
      baseName,
      'application/octet-stream'
    );
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const removed = await cleanupOldBackups(folderUri);
    const retentionNote =
      removed > 0 ? ` Removed ${removed} backup${removed === 1 ? '' : 's'} older than ${RETENTION_DAYS} days.` : '';

    return {
      success: true,
      message: `Backed up as ${baseName}.db.${retentionNote}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Backup failed',
    };
  }
}

export async function backupDatabase(): Promise<{ success: boolean; message: string }> {
  const folderUri = await getBackupFolderUri();
  if (!folderUri) {
    return { success: false, message: 'No backup folder selected. Go to Settings.' };
  }

  const dateKey = todayDateKey();
  const result = await writeBackupToFolder(folderUri, dateKey);
  if (result.success) {
    await AsyncStorage.setItem(LAST_DAILY_BACKUP_KEY, dateKey);
  }
  return result;
}

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

  const result = await writeBackupToFolder(folderUri, today);
  if (result.success) {
    await AsyncStorage.setItem(LAST_DAILY_BACKUP_KEY, today);
    return { ran: true, message: result.message };
  }

  return { ran: false, message: result.message };
}

export async function restoreDatabaseFromBackup(): Promise<{ success: boolean; message: string }> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false, message: 'Restore cancelled' };
    }

    await closeDatabase();

    const dest = getDbPath();
    await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });

    await getDatabase();

    return { success: true, message: `Restored from ${result.assets[0].name}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Restore failed',
    };
  }
}

export async function triggerAutoBackup(): Promise<void> {
  try {
    await runDailyBackupIfDue();
  } catch {
    // Backup must never block saves
  }
}

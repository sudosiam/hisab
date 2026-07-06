import * as FileSystem from 'expo-file-system/legacy';
import {
  getAllAttachments,
  getAttachmentFileUri,
  MEDIA_ROOT,
} from './attachments';

async function loadJSZip() {
  const { default: JSZip } = await import('jszip');
  return JSZip;
}

const BACKUP_PREFIX = 'hisab-backup-';
const BACKUP_MEDIA_DIR = 'media';
const MANIFEST_NAME = 'backup-manifest.json';

export interface FullBackupManifest {
  version: 1;
  dateKey: string;
  attachmentCount: number;
  missingLocal: number;
}

export function fullBackupZipName(dateKey: string): string {
  return `hisab-full-${dateKey}.zip`;
}

export function backupDbPathInZip(dateKey: string): string {
  return `database/${BACKUP_PREFIX}${dateKey}.db`;
}

function mediaPathInZip(relativePath: string): string {
  return `${BACKUP_MEDIA_DIR}/${relativePath}`;
}

export function isZipBackupBase64(base64: string): boolean {
  try {
    const header = atob(base64.slice(0, 8));
    return header.startsWith('PK');
  } catch {
    return false;
  }
}

/** Build a zip containing the database file and all attachment media. */
export async function buildFullBackupZipFromDb(
  dateKey: string,
  dbBase64: string
): Promise<{ zipPath: string; attachmentCount: number; missing: number }> {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  zip.file(backupDbPathInZip(dateKey), dbBase64, { base64: true });

  const attachments = await getAllAttachments();
  let attachmentCount = 0;
  let missing = 0;

  for (const attachment of attachments) {
    const localUri = getAttachmentFileUri(attachment.storage_path);
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      missing += 1;
      continue;
    }
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zip.file(mediaPathInZip(attachment.storage_path), base64, { base64: true });
    attachmentCount += 1;
  }

  const manifest: FullBackupManifest = {
    version: 1,
    dateKey,
    attachmentCount,
    missingLocal: missing,
  };
  zip.file(MANIFEST_NAME, JSON.stringify(manifest));

  const zipBase64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const zipPath = `${FileSystem.cacheDirectory}${fullBackupZipName(dateKey)}`;
  await FileSystem.writeAsStringAsync(zipPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { zipPath, attachmentCount, missing };
}

export interface ExtractedFullBackup {
  dbBase64: string;
  dbLabel: string;
  mediaFiles: { relativePath: string; base64: string }[];
  manifest: FullBackupManifest | null;
}

/** Read a Hisab full-backup zip from disk. */
export async function extractFullBackupZip(sourceUri: string): Promise<ExtractedFullBackup> {
  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return extractFullBackupZipFromBase64(base64);
}

export async function extractFullBackupZipFromBase64(base64: string): Promise<ExtractedFullBackup> {
  if (!isZipBackupBase64(base64)) {
    throw new Error('That file is not a Hisab full backup zip.');
  }

  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(base64, { base64: true });
  let dbBase64: string | null = null;
  let dbLabel = 'backup.db';
  const mediaFiles: { relativePath: string; base64: string }[] = [];

  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (entry.dir) continue;

    if (path === MANIFEST_NAME) continue;

    if (path.startsWith('database/') && path.endsWith('.db')) {
      dbBase64 = await entry.async('base64');
      dbLabel = path.split('/').pop() ?? dbLabel;
      continue;
    }

    if (path.startsWith(`${BACKUP_MEDIA_DIR}/`)) {
      const relativePath = path.slice(BACKUP_MEDIA_DIR.length + 1);
      mediaFiles.push({
        relativePath,
        base64: await entry.async('base64'),
      });
    }
  }

  if (!dbBase64) {
    throw new Error('No database file found inside the backup zip.');
  }

  let manifest: FullBackupManifest | null = null;
  const manifestEntry = zip.file(MANIFEST_NAME);
  if (manifestEntry) {
    try {
      manifest = JSON.parse(await manifestEntry.async('string')) as FullBackupManifest;
    } catch {
      manifest = null;
    }
  }

  return { dbBase64, dbLabel, mediaFiles, manifest };
}

/** Write extracted media files into local app storage. */
export async function writeExtractedMediaToLocal(
  mediaFiles: { relativePath: string; base64: string }[]
): Promise<number> {
  let written = 0;

  for (const file of mediaFiles) {
    const relativeDir = file.relativePath.split('/').slice(0, -1).join('/');
    if (relativeDir) {
      const localDir = `${MEDIA_ROOT}${relativeDir}`;
      const dirInfo = await FileSystem.getInfoAsync(localDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
      }
    }
    const localUri = `${MEDIA_ROOT}${file.relativePath}`;
    await FileSystem.writeAsStringAsync(localUri, file.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    written += 1;
  }

  return written;
}

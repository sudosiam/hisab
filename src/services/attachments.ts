import * as IntentLauncher from 'expo-intent-launcher';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getDatabase } from '../db/database';
import type { Attachment, AttachmentReferenceType, PendingAttachment } from '../types';

export const MEDIA_ROOT = `${FileSystem.documentDirectory}media/`;

export async function clearAllLocalMedia(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MEDIA_ROOT);
  if (info.exists) {
    await FileSystem.deleteAsync(MEDIA_ROOT, { idempotent: true });
  }
}

const PENDING_ATTACHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Remove stale draft attachment folders left after the OS kills the app mid-form. */
export async function cleanupExpiredPendingAttachments(): Promise<void> {
  const pendingRoot = `${MEDIA_ROOT}_pending/`;
  const rootInfo = await FileSystem.getInfoAsync(pendingRoot);
  if (!rootInfo.exists) return;

  const sessions = await FileSystem.readDirectoryAsync(pendingRoot);
  const now = Date.now();
  for (const session of sessions) {
    const sessionDir = `${pendingRoot}${session}`;
    const sessionInfo = await FileSystem.getInfoAsync(sessionDir);
    if (!sessionInfo.exists || !('modificationTime' in sessionInfo) || !sessionInfo.modificationTime) {
      continue;
    }
    if (now - sessionInfo.modificationTime * 1000 > PENDING_ATTACHMENT_TTL_MS) {
      await FileSystem.deleteAsync(sessionDir, { idempotent: true });
    }
  }
}

function absolutePath(relativePath: string): string {
  return `${MEDIA_ROOT}${relativePath}`;
}

function extensionFromUri(uri: string, mimeType: string, fileName?: string): string {
  if (mimeType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf')) return 'pdf';
  const fromUri = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  if (fromUri && fromUri.length <= 5 && /^[a-z0-9]+$/.test(fromUri)) {
    return fromUri;
  }
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'bin';
}

async function ensureMediaDir(relativeDir: string): Promise<void> {
  const dir = `${MEDIA_ROOT}${relativeDir}`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export function getAttachmentFileUri(relativePath: string): string {
  return absolutePath(relativePath);
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function isPdfAttachment(mimeType: string, fileName: string): boolean {
  if (mimeType === 'application/pdf') return true;
  return fileName.toLowerCase().endsWith('.pdf');
}

function normalizeMimeType(mimeType: string, fileName: string): string {
  if (isPdfAttachment(mimeType, fileName)) return 'application/pdf';
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return mimeType || 'application/octet-stream';
}

async function getShareableUri(localUri: string): Promise<string> {
  if (Platform.OS === 'android') {
    return FileSystem.getContentUriAsync(localUri);
  }
  return localUri;
}

export async function getAttachments(
  referenceType: AttachmentReferenceType,
  referenceId: number
): Promise<Attachment[]> {
  const db = await getDatabase();
  return db.getAllAsync<Attachment>(
    `SELECT * FROM attachments WHERE reference_type = ? AND reference_id = ? ORDER BY created_at`,
    [referenceType, referenceId]
  );
}

export async function getAllAttachments(): Promise<Attachment[]> {
  const db = await getDatabase();
  return db.getAllAsync<Attachment>(`SELECT * FROM attachments ORDER BY created_at`);
}

async function copyToMediaStorage(
  sourceUri: string,
  referenceType: AttachmentReferenceType,
  referenceId: number,
  fileName: string,
  mimeType: string
): Promise<{ storagePath: string; fileSize: number }> {
  const ext = extensionFromUri(sourceUri, mimeType, fileName);
  const storedName = `${Crypto.randomUUID()}.${ext}`;
  const relativeDir = `${referenceType}s/${referenceId}`;
  await ensureMediaDir(relativeDir);
  const storagePath = `${relativeDir}/${storedName}`;
  const dest = absolutePath(storagePath);
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  const info = await FileSystem.getInfoAsync(dest);
  return { storagePath, fileSize: info.exists && 'size' in info ? info.size ?? 0 : 0 };
}

async function copyToPendingStorage(
  sourceUri: string,
  sessionKey: string,
  fileName: string,
  mimeType: string
): Promise<{ storagePath: string; fileSize: number }> {
  const ext = extensionFromUri(sourceUri, mimeType, fileName);
  const storedName = `${Crypto.randomUUID()}.${ext}`;
  const relativeDir = `_pending/${sessionKey}`;
  await ensureMediaDir(relativeDir);
  const storagePath = `${relativeDir}/${storedName}`;
  const dest = absolutePath(storagePath);
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  const info = await FileSystem.getInfoAsync(dest);
  return { storagePath, fileSize: info.exists && 'size' in info ? info.size ?? 0 : 0 };
}

export function pendingAttachmentAsViewItem(
  item: PendingAttachment,
  referenceType: AttachmentReferenceType
): Attachment {
  return {
    id: 0,
    reference_type: referenceType,
    reference_id: 0,
    file_name: item.file_name,
    mime_type: item.mime_type,
    storage_path: item.storage_path,
    file_size: item.file_size,
    created_at: new Date().toISOString(),
  };
}

async function insertAttachment(
  referenceType: AttachmentReferenceType,
  referenceId: number,
  fileName: string,
  mimeType: string,
  storagePath: string,
  fileSize: number
): Promise<Attachment> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO attachments (reference_type, reference_id, file_name, mime_type, storage_path, file_size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [referenceType, referenceId, fileName, mimeType, storagePath, fileSize]
  );
  const row = await db.getFirstAsync<Attachment>(`SELECT * FROM attachments WHERE id = ?`, [
    result.lastInsertRowId,
  ]);
  if (!row) throw new Error('Failed to save attachment');
  return row;
}

export async function addAttachmentFromUri(
  referenceType: AttachmentReferenceType,
  referenceId: number,
  sourceUri: string,
  fileName: string,
  mimeType: string
): Promise<Attachment> {
  const normalizedMime = normalizeMimeType(mimeType, fileName);
  const { storagePath, fileSize } = await copyToMediaStorage(
    sourceUri,
    referenceType,
    referenceId,
    fileName,
    normalizedMime
  );
  return insertAttachment(referenceType, referenceId, fileName, normalizedMime, storagePath, fileSize);
}

export async function pickAndAddAttachment(
  referenceType: AttachmentReferenceType,
  referenceId: number,
  source: 'camera' | 'gallery' | 'document'
): Promise<Attachment | null> {
  if (source === 'document') {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return addAttachmentFromUri(
      referenceType,
      referenceId,
      asset.uri,
      asset.name ?? 'document',
      asset.mimeType ?? 'application/octet-stream'
    );
  }

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to take a photo.');
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return addAttachmentFromUri(
      referenceType,
      referenceId,
      asset.uri,
      `photo-${Date.now()}.jpg`,
      asset.mimeType ?? 'image/jpeg'
    );
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to choose an image.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  return addAttachmentFromUri(
    referenceType,
    referenceId,
    asset.uri,
    name,
    asset.mimeType ?? 'image/jpeg'
  );
}

async function addPendingAttachmentFromUri(
  sessionKey: string,
  sourceUri: string,
  fileName: string,
  mimeType: string
): Promise<PendingAttachment> {
  const normalizedMime = normalizeMimeType(mimeType, fileName);
  const { storagePath, fileSize } = await copyToPendingStorage(
    sourceUri,
    sessionKey,
    fileName,
    normalizedMime
  );
  return {
    localKey: Crypto.randomUUID(),
    file_name: fileName,
    mime_type: normalizedMime,
    storage_path: storagePath,
    file_size: fileSize,
  };
}

export async function pickAndAddPendingAttachment(
  sessionKey: string,
  source: 'camera' | 'gallery' | 'document'
): Promise<PendingAttachment | null> {
  if (source === 'document') {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return addPendingAttachmentFromUri(
      sessionKey,
      asset.uri,
      asset.name ?? 'document',
      asset.mimeType ?? 'application/octet-stream'
    );
  }

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to take a photo.');
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return addPendingAttachmentFromUri(
      sessionKey,
      asset.uri,
      `photo-${Date.now()}.jpg`,
      asset.mimeType ?? 'image/jpeg'
    );
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to choose an image.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  return addPendingAttachmentFromUri(sessionKey, asset.uri, name, asset.mimeType ?? 'image/jpeg');
}

export async function deletePendingAttachment(item: PendingAttachment): Promise<void> {
  await FileSystem.deleteAsync(absolutePath(item.storage_path), { idempotent: true });
}

export async function clearPendingAttachments(items: PendingAttachment[]): Promise<void> {
  for (const item of items) {
    await deletePendingAttachment(item);
  }
}

export async function commitPendingAttachments(
  referenceType: AttachmentReferenceType,
  referenceId: number,
  items: PendingAttachment[]
): Promise<void> {
  for (const item of items) {
    const sourceUri = absolutePath(item.storage_path);
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (!info.exists) continue;
    await addAttachmentFromUri(
      referenceType,
      referenceId,
      sourceUri,
      item.file_name,
      item.mime_type
    );
    await FileSystem.deleteAsync(sourceUri, { idempotent: true });
  }
}

export async function deleteAttachment(id: number): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Attachment>(`SELECT * FROM attachments WHERE id = ?`, [id]);
  if (!row) return;
  await db.runAsync(`DELETE FROM attachments WHERE id = ?`, [id]);
  await FileSystem.deleteAsync(absolutePath(row.storage_path), { idempotent: true });
}

export async function deleteAttachmentsForReference(
  referenceType: AttachmentReferenceType,
  referenceId: number
): Promise<void> {
  const items = await getAttachments(referenceType, referenceId);
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM attachments WHERE reference_type = ? AND reference_id = ?`, [
    referenceType,
    referenceId,
  ]);
  for (const item of items) {
    await FileSystem.deleteAsync(absolutePath(item.storage_path), { idempotent: true });
  }
}

export async function readAttachmentBase64(item: Attachment): Promise<string> {
  const uri = getAttachmentFileUri(item.storage_path);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('File not found.');
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function openAttachmentExternal(item: Attachment): Promise<void> {
  const uri = getAttachmentFileUri(item.storage_path);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('File not found.');
  }

  const mimeType = normalizeMimeType(item.mime_type, item.file_name);

  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: mimeType,
      // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
      flags: 0x10000001,
    });
    return;
  }

  await shareAttachment(item);
}

export async function shareAttachment(item: Attachment): Promise<void> {
  const uri = getAttachmentFileUri(item.storage_path);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const shareUri = await getShareableUri(uri);
  await Sharing.shareAsync(shareUri, {
    mimeType: normalizeMimeType(item.mime_type, item.file_name),
    dialogTitle: item.file_name,
  });
}

export async function downloadAttachment(item: Attachment): Promise<string> {
  const uri = getAttachmentFileUri(item.storage_path);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('File not found.');
  }

  if (isImageMime(item.mime_type)) {
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Gallery permission is required to save photos.');
    }
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'Saved to gallery';
  }

  const cacheUri = `${FileSystem.cacheDirectory}${item.file_name.replace(/[^\w.-]+/g, '_')}`;
  await FileSystem.copyAsync({ from: uri, to: cacheUri });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const shareUri = await getShareableUri(cacheUri);
  await Sharing.shareAsync(shareUri, {
    mimeType: normalizeMimeType(item.mime_type, item.file_name),
    dialogTitle: `Save ${item.file_name}`,
  });
  return 'Choose Save or Downloads in the menu';
}

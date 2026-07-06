const BACKUP_PREFIX = 'hisab-backup-';

export function fullBackupZipName(dateKey: string): string {
  return `hisab-full-${dateKey}.zip`;
}

export function backupDbPathInZip(dateKey: string): string {
  return `database/${BACKUP_PREFIX}${dateKey}.db`;
}

export function isZipBackupBase64(base64: string): boolean {
  try {
    const header = atob(base64.slice(0, 8));
    return header.startsWith('PK');
  } catch {
    return false;
  }
}

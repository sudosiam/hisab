import {
  backupDbPathInZip,
  fullBackupZipName,
  isZipBackupBase64,
} from '../backupNames';

describe('backupNames helpers', () => {
  it('builds consistent zip and db paths', () => {
    expect(fullBackupZipName('2026-04-07')).toBe('hisab-full-2026-04-07.zip');
    expect(backupDbPathInZip('2026-04-07')).toBe('database/hisab-backup-2026-04-07.db');
  });

  it('detects zip files by PK header', () => {
    const zipHeader = Buffer.from('PK\x03\x04').toString('base64');
    expect(isZipBackupBase64(zipHeader + 'AAAA')).toBe(true);
    expect(isZipBackupBase64(Buffer.from('SQLite format 3').toString('base64'))).toBe(false);
  });
});

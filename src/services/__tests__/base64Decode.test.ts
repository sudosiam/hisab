import { base64ToUint8Array } from '../cloudBackup';

describe('base64ToUint8Array', () => {
  it('decodes a short ASCII payload', () => {
    const bytes = base64ToUint8Array('SGk=');
    expect(Array.from(bytes)).toEqual([72, 105]);
  });

  it('decodes longer payloads across chunk boundaries', () => {
    const text = 'HelloHisab'.repeat(4000);
    const encoded = Buffer.from(text, 'utf8').toString('base64');
    const bytes = base64ToUint8Array(encoded);
    expect(Buffer.from(bytes).toString('utf8')).toBe(text);
  });
});

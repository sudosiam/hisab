import * as FileSystem from 'expo-file-system/legacy';

/** Android often finishes shareAsync before the receiver reads the file. */
const DEFER_DELETE_MS = 10 * 60 * 1000;

/**
 * Delete a cache share/export file after receivers have had time to read it.
 * Immediate delete is still used when sharing is unavailable (file unused).
 */
export function deferDeleteCacheFile(uri: string): void {
  const timer = setTimeout(() => {
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }, DEFER_DELETE_MS);
  // Avoid keeping Jest / Node workers alive; no-op in React Native (number handle).
  const handle = timer as unknown as { unref?: () => void };
  handle.unref?.();
}

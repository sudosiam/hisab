import { Alert } from 'react-native';
import { formatSqliteError } from '../db/database';

/** Pull-to-refresh / background reload failures. */
export function alertRefreshFailed(error: unknown): void {
  Alert.alert('Refresh failed', formatSqliteError(error));
}

/** One-off load helpers (pickers, meta) that should not fail silently. */
export function alertLoadFailed(error: unknown, title = 'Error'): void {
  Alert.alert(title, formatSqliteError(error));
}

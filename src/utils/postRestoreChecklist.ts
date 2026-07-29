import { Alert } from 'react-native';

/** Lightweight post-restore checklist (no heavy integrity scan). */
export function showPostRestoreChecklist(router?: { push: (href: never) => void }): void {
  Alert.alert(
    'Restore complete — verify books',
    '1. Open Trial Balance and confirm it looks right\n2. Check Dashboard for the current period\n3. Confirm Backup folder / cloud settings still look correct',
    [
      {
        text: 'Open Trial Balance',
        onPress: () => router?.push('/(drawer)/reports/trial-balance' as never),
      },
      {
        text: 'Dashboard',
        onPress: () => router?.push('/(drawer)/' as never),
      },
      { text: 'OK', style: 'cancel' },
    ]
  );
}

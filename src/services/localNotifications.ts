/**
 * Local (device) notifications only — never load expo-notifications in Expo Go
 * (Android SDK 53+ throws on import for push token registration).
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let handlerConfigured = false;

const BACKUP_CHANNEL_ID = 'hisab-backup';

export function isNotificationsNativeUnavailable(): boolean {
  return Constants.appOwnership === 'expo';
}

async function getNotifications(): Promise<NotificationsModule | null> {
  if (isNotificationsNativeUnavailable()) return null;
  if (notificationsModule !== undefined) return notificationsModule;
  try {
    const mod = await import('expo-notifications');
    if (!handlerConfigured) {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      handlerConfigured = true;
    }
    notificationsModule = mod;
    return mod;
  } catch {
    notificationsModule = null;
    return null;
  }
}

async function ensureChannel(
  Notifications: NotificationsModule,
  channelId: string,
  name: string
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(channelId, {
    name,
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 80],
  });
}

async function ensurePermission(Notifications: NotificationsModule): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  const asked = await Notifications.requestPermissionsAsync();
  return Boolean(
    asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/** Fire a one-shot local notification immediately (best-effort). */
export async function presentLocalNotification(params: {
  title: string;
  body: string;
  channelId?: string;
  channelName?: string;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    const channelId = params.channelId ?? BACKUP_CHANNEL_ID;
    await ensureChannel(Notifications, channelId, params.channelName ?? 'Backup');
    if (!(await ensurePermission(Notifications))) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        data: params.data,
        ...(Platform.OS === 'android' ? { channelId } : null),
      },
      trigger: null,
    });
  } catch {
    // Never fail a backup because of notifications.
  }
}

export async function notifyAutoBackupDone(kind: 'device' | 'cloud'): Promise<void> {
  if (kind === 'cloud') {
    await presentLocalNotification({
      title: 'Hisab — cloud backup done',
      body: 'Today’s automatic cloud backup finished successfully.',
      channelId: BACKUP_CHANNEL_ID,
      channelName: 'Backup',
      data: { screen: 'backup' },
    });
    return;
  }
  await presentLocalNotification({
    title: 'Hisab — auto backup done',
    body: 'Today’s automatic device backup was saved to your backup folder.',
    channelId: BACKUP_CHANNEL_ID,
    channelName: 'Backup',
    data: { screen: 'backup' },
  });
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getPayablesReport, getReceivablesReport } from './reports';
import { formatCurrencyWhole } from '../utils/format';
import { todayISO } from '../utils/date';
import { parseISO } from 'date-fns';
import { roundMoney } from '../utils/money';
import { isNotificationsNativeUnavailable } from './localNotifications';

const ENABLED_KEY = '@hisab/overdue_reminders_enabled';
const DAYS_KEY = '@hisab/overdue_reminders_days';
const DAILY_ID_KEY = '@hisab/overdue_reminders_daily_id';

const CHANNEL_ID = 'hisab-overdue';
const DEFAULT_DAYS = 7;

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let handlerConfigured = false;

export { isNotificationsNativeUnavailable };

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

export async function isOverdueRemindersEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export async function getOverdueReminderDays(): Promise<number> {
  const raw = await AsyncStorage.getItem(DAYS_KEY);
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_DAYS;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(90, Math.max(1, n));
}

export async function setOverdueReminderDays(days: number): Promise<void> {
  const clamped = Math.min(90, Math.max(1, Math.floor(days)));
  await AsyncStorage.setItem(DAYS_KEY, String(clamped));
  if (await isOverdueRemindersEnabled()) {
    await scheduleOverdueReminder();
  }
}

export interface OverdueSummary {
  receivableCount: number;
  receivableTotal: number;
  payableCount: number;
  payableTotal: number;
}

function daysBetween(isoDate: string, today: string): number {
  const start = parseISO(isoDate);
  const end = parseISO(today);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function getOverdueSummary(minDays?: number): Promise<OverdueSummary> {
  const days = minDays ?? (await getOverdueReminderDays());
  const today = todayISO();
  const [receivables, payables] = await Promise.all([
    getReceivablesReport(),
    getPayablesReport(),
  ]);

  let receivableCount = 0;
  let receivableTotal = 0;
  for (const row of receivables) {
    if (daysBetween(row.date, today) >= days) {
      receivableCount += 1;
      receivableTotal = roundMoney(receivableTotal + row.due);
    }
  }

  let payableCount = 0;
  let payableTotal = 0;
  for (const row of payables) {
    if (daysBetween(row.date, today) >= days) {
      payableCount += 1;
      payableTotal = roundMoney(payableTotal + row.due);
    }
  }

  return { receivableCount, receivableTotal, payableCount, payableTotal };
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Overdue dues',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 120],
  });
}

export async function requestOverdueReminderPermissions(): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;
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

async function cancelScheduled(): Promise<void> {
  const Notifications = await getNotifications();
  const id = await AsyncStorage.getItem(DAILY_ID_KEY);
  if (id && Notifications) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // ignore
    }
  }
  await AsyncStorage.removeItem(DAILY_ID_KEY);
}

const NATIVE_BUILD_MESSAGE =
  'Overdue reminders need a native Hisab APK (not Expo Go). Android push was removed from Expo Go in SDK 53.';

/** Schedule one daily local notification summarizing overdue AR/AP. */
export async function scheduleOverdueReminder(): Promise<{ success: boolean; message: string }> {
  if (isNotificationsNativeUnavailable()) {
    return { success: false, message: NATIVE_BUILD_MESSAGE };
  }

  const Notifications = await getNotifications();
  if (!Notifications) {
    return { success: false, message: NATIVE_BUILD_MESSAGE };
  }

  await ensureAndroidChannel(Notifications);
  const allowed = await requestOverdueReminderPermissions();
  if (!allowed) {
    return { success: false, message: 'Notification permission is required.' };
  }

  await cancelScheduled();

  const summary = await getOverdueSummary();
  const totalCount = summary.receivableCount + summary.payableCount;
  const body =
    totalCount === 0
      ? 'No overdue receivables or payables today.'
      : `${summary.receivableCount} receivable (${formatCurrencyWhole(summary.receivableTotal)}) · ${summary.payableCount} payable (${formatCurrencyWhole(summary.payableTotal)})`;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Hisab — overdue dues',
      body,
      data: { screen: 'receivables' },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
    },
  });

  await AsyncStorage.setItem(DAILY_ID_KEY, id);
  await AsyncStorage.setItem(ENABLED_KEY, 'true');
  return { success: true, message: 'Daily overdue reminder scheduled for 9:00.' };
}

export async function setOverdueRemindersEnabled(
  enabled: boolean
): Promise<{ success: boolean; message: string }> {
  if (!enabled) {
    await cancelScheduled();
    await AsyncStorage.setItem(ENABLED_KEY, 'false');
    return { success: true, message: 'Overdue reminders off.' };
  }
  return scheduleOverdueReminder();
}

/** Reschedule if enabled (call on app foreground / after restore). */
export async function syncOverdueReminders(): Promise<void> {
  if (isNotificationsNativeUnavailable()) return;
  if (!(await isOverdueRemindersEnabled())) return;
  await scheduleOverdueReminder().catch(() => {});
}

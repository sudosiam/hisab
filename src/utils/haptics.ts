import { isHapticsEnabled } from '../services/appSettings';

let cachedEnabled: boolean | null = null;

/** Refresh cached preference (call after settings toggle). */
export function setHapticsEnabledCache(enabled: boolean): void {
  cachedEnabled = enabled;
}

async function resolveEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  cachedEnabled = await isHapticsEnabled();
  return cachedEnabled;
}

export async function hapticLight(): Promise<void> {
  if (!(await resolveEnabled())) return;
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Native module missing (Expo Go / web) — ignore.
  }
}

export async function hapticWarning(): Promise<void> {
  if (!(await resolveEnabled())) return;
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // ignore
  }
}

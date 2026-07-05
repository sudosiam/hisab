import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEYS = {
  enabled: 'app_lock_enabled',
  biometric: 'app_lock_biometric',
  pinHash: 'app_lock_pin_hash',
  pinSalt: 'app_lock_pin_salt',
  pinVersion: 'app_lock_pin_version',
  attempts: 'app_lock_failed_attempts',
} as const;

export const PIN_LENGTH = 4;

/** Rounds of SHA-256 applied to the PIN to slow down brute-force attempts. */
const PIN_HASH_ITERATIONS = 10_000;
const PIN_HASH_VERSION = '2';

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function isAppLockSupported(): Promise<boolean> {
  return Platform.OS !== 'web';
}

async function hashPinLegacy(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  let digest = `${salt}:${pin}`;
  for (let i = 0; i < PIN_HASH_ITERATIONS; i++) {
    digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digest);
  }
  return digest;
}

async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isAppLockEnabled(): Promise<boolean> {
  if (!(await isAppLockSupported())) return false;
  return (await SecureStore.getItemAsync(KEYS.enabled)) === '1';
}

export async function hasPinConfigured(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(KEYS.pinHash));
}

async function storePin(pin: string): Promise<void> {
  const salt = await generateSalt();
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(KEYS.pinSalt, salt);
  await SecureStore.setItemAsync(KEYS.pinHash, hash);
  await SecureStore.setItemAsync(KEYS.pinVersion, PIN_HASH_VERSION);
}

export async function setupPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
  await storePin(pin);
  await SecureStore.setItemAsync(KEYS.enabled, '1');
  await clearFailedAttempts();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const salt = await SecureStore.getItemAsync(KEYS.pinSalt);
  const stored = await SecureStore.getItemAsync(KEYS.pinHash);
  if (!salt || !stored) return false;

  const version = await SecureStore.getItemAsync(KEYS.pinVersion);
  if (version === PIN_HASH_VERSION) {
    return (await hashPin(pin, salt)) === stored;
  }

  // Legacy single-round hash: verify, then transparently upgrade to the
  // iterated scheme on success.
  const legacyMatch = (await hashPinLegacy(pin, salt)) === stored;
  if (legacyMatch) {
    try {
      await storePin(pin);
    } catch {
      // Upgrade failure is non-fatal; the legacy hash still works.
    }
  }
  return legacyMatch;
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  if (!(await verifyPin(currentPin))) throw new Error('Current PIN is incorrect');
  if (!isValidPin(newPin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
  await storePin(newPin);
  await clearFailedAttempts();
}

export async function disableAppLock(pin: string): Promise<void> {
  if (!(await verifyPin(pin))) throw new Error('Incorrect PIN');
  await SecureStore.deleteItemAsync(KEYS.enabled);
  await SecureStore.deleteItemAsync(KEYS.biometric);
  await SecureStore.deleteItemAsync(KEYS.pinHash);
  await SecureStore.deleteItemAsync(KEYS.pinSalt);
  await SecureStore.deleteItemAsync(KEYS.pinVersion);
  await clearFailedAttempts();
}

export interface FailedAttemptState {
  attempts: number;
  cooldownUntil: number;
}

/** Failed unlock attempts persist across app restarts so force-quitting can't reset the cooldown. */
export async function getFailedAttemptState(): Promise<FailedAttemptState> {
  try {
    const raw = await SecureStore.getItemAsync(KEYS.attempts);
    if (!raw) return { attempts: 0, cooldownUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<FailedAttemptState>;
    return {
      attempts: Number.isFinite(parsed.attempts) ? Number(parsed.attempts) : 0,
      cooldownUntil: Number.isFinite(parsed.cooldownUntil) ? Number(parsed.cooldownUntil) : 0,
    };
  } catch {
    return { attempts: 0, cooldownUntil: 0 };
  }
}

export async function setFailedAttemptState(state: FailedAttemptState): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.attempts, JSON.stringify(state));
  } catch {
    // Persisting the counter is best-effort.
  }
}

export async function clearFailedAttempts(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.attempts);
  } catch {
    // Best-effort.
  }
}

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  if (!(await isAppLockEnabled())) return false;
  return (await SecureStore.getItemAsync(KEYS.biometric)) === '1';
}

export async function setBiometricUnlockEnabled(enabled: boolean, pin: string): Promise<void> {
  if (!(await verifyPin(pin))) throw new Error('Incorrect PIN');
  if (enabled) {
    const capability = await getBiometricCapability();
    if (!capability.available) {
      throw new Error(capability.reason ?? 'Biometrics not available');
    }
    await SecureStore.setItemAsync(KEYS.biometric, '1');
    return;
  }
  await SecureStore.deleteItemAsync(KEYS.biometric);
}

export async function getBiometricCapability(): Promise<{
  available: boolean;
  label: string;
  reason?: string;
}> {
  if (Platform.OS === 'web') {
    return { available: false, label: 'Biometrics', reason: 'Not supported on web' };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    return { available: false, label: 'Biometrics', reason: 'This device has no biometric sensor' };
  }

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    return {
      available: false,
      label: 'Biometrics',
      reason: 'Set up fingerprint or face unlock in your phone settings first',
    };
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return { available: true, label: Platform.OS === 'ios' ? 'Face ID' : 'Face unlock' };
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return { available: true, label: Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint' };
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return { available: true, label: 'Iris unlock' };
  }

  return { available: true, label: 'Biometrics' };
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  const capability = await getBiometricCapability();
  if (!capability.available) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Hisab',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: true,
  });

  return result.success;
}

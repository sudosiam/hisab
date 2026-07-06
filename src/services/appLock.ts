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

type PinMaterial = { salt: string; hash: string; version: string | null };

/** Object wrapper avoids Hermes "Property doesn't exist" on module-level `let` after HMR. */
const pinMaterialCache: { data: PinMaterial | null } = { data: null };

/** Single salted SHA-256 — fast on device; brute force is limited by lockout rules. */
const PIN_HASH_VERSION = '4';
const LEGACY_V3_PIN_HASH_ITERATIONS = 1_500;
const LEGACY_V2_PIN_HASH_ITERATIONS = 10_000;

async function hashPinLegacy(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

async function hashPinWithIterations(pin: string, salt: string, iterations: number): Promise<string> {
  let digest = `${salt}:${pin}`;
  for (let i = 0; i < iterations; i++) {
    digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digest);
  }
  return digest;
}

/** Current fast hash — one native crypto call. */
async function hashPin(pin: string, salt: string): Promise<string> {
  return hashPinLegacy(pin, salt);
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function isAppLockSupported(): Promise<boolean> {
  return Platform.OS !== 'web';
}

async function loadPinMaterial(): Promise<PinMaterial | null> {
  if (pinMaterialCache.data) return pinMaterialCache.data;
  const salt = await SecureStore.getItemAsync(KEYS.pinSalt);
  const hash = await SecureStore.getItemAsync(KEYS.pinHash);
  if (!salt || !hash) return null;
  const version = await SecureStore.getItemAsync(KEYS.pinVersion);
  pinMaterialCache.data = { salt, hash, version };
  return pinMaterialCache.data;
}

function clearPinMaterialCache(): void {
  pinMaterialCache.data = null;
}

/** Warm SecureStore reads before the user finishes entering their PIN. */
export async function prefetchPinMaterial(): Promise<void> {
  await loadPinMaterial();
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
  pinMaterialCache.data = { salt, hash, version: PIN_HASH_VERSION };
}

export async function setupPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
  await storePin(pin);
  await SecureStore.setItemAsync(KEYS.enabled, '1');
  await clearFailedAttempts();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const material = await loadPinMaterial();
  if (!material) return false;

  const { salt, hash: stored, version } = material;

  if (version === PIN_HASH_VERSION) {
    return (await hashPin(pin, salt)) === stored;
  }

  if (version === '3') {
    const match =
      (await hashPinWithIterations(pin, salt, LEGACY_V3_PIN_HASH_ITERATIONS)) === stored;
    if (match) {
      try {
        await storePin(pin);
      } catch {
        // Upgrade failure is non-fatal.
      }
    }
    return match;
  }

  if (version === '2') {
    const match =
      (await hashPinWithIterations(pin, salt, LEGACY_V2_PIN_HASH_ITERATIONS)) === stored;
    if (match) {
      try {
        await storePin(pin);
      } catch {
        // Upgrade failure is non-fatal.
      }
    }
    return match;
  }

  // Legacy single-round hash (v1 / unset version).
  const legacyMatch = (await hashPinLegacy(pin, salt)) === stored;
  if (legacyMatch) {
    try {
      await storePin(pin);
    } catch {
      // Upgrade failure is non-fatal.
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
  clearPinMaterialCache();
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

export async function authenticateWithBiometrics(options?: {
  skipCapabilityCheck?: boolean;
}): Promise<boolean> {
  if (!options?.skipCapabilityCheck) {
    const capability = await getBiometricCapability();
    if (!capability.available) return false;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Hisab',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: true,
    requireConfirmation: false,
  });

  return result.success;
}

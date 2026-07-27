/**
 * Supabase auth session storage: prefer SecureStore on device,
 * fall back to AsyncStorage (tests, web, SecureStore unavailable / size errors).
 * Migrates any legacy AsyncStorage session into SecureStore on read.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

let secureStoreAvailable: boolean | null = null;

async function canUseSecureStore(): Promise<boolean> {
  if (secureStoreAvailable != null) return secureStoreAvailable;
  try {
    secureStoreAvailable = await SecureStore.isAvailableAsync();
  } catch {
    secureStoreAvailable = false;
  }
  return secureStoreAvailable;
}

/** Test helper — clears the SecureStore availability cache. */
export function resetSupabaseAuthStorageCacheForTests(): void {
  secureStoreAvailable = null;
}

async function setSecure(key: string, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch {
    return false;
  }
}

export const supabaseAuthStorage: AuthStorage = {
  getItem: async (key) => {
    if (await canUseSecureStore()) {
      try {
        const secure = await SecureStore.getItemAsync(key);
        if (secure != null) return secure;
        const legacy = await AsyncStorage.getItem(key);
        if (legacy != null) {
          const moved = await setSecure(key, legacy);
          if (moved) await AsyncStorage.removeItem(key);
        }
        return legacy;
      } catch {
        // fall through to AsyncStorage
      }
    }
    return AsyncStorage.getItem(key);
  },

  setItem: async (key, value) => {
    if (await canUseSecureStore()) {
      const ok = await setSecure(key, value);
      if (ok) {
        try {
          await AsyncStorage.removeItem(key);
        } catch {
          // ignore cleanup failure
        }
        return;
      }
    }
    await AsyncStorage.setItem(key, value);
  },

  removeItem: async (key) => {
    if (await canUseSecureStore()) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // ignore; still clear AsyncStorage
      }
    }
    await AsyncStorage.removeItem(key);
  },
};

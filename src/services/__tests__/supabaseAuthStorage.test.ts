import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  resetSupabaseAuthStorageCacheForTests,
  supabaseAuthStorage,
} from '../supabaseAuthStorage';

const secureStoreMock = SecureStore as typeof SecureStore & {
  __resetSecureStoreMock: (options?: { available?: boolean; setShouldFail?: boolean }) => void;
};

describe('supabaseAuthStorage', () => {
  const key = 'sb-test-auth-token';

  beforeEach(async () => {
    secureStoreMock.__resetSecureStoreMock();
    resetSupabaseAuthStorageCacheForTests();
    await AsyncStorage.removeItem(key);
  });

  it('stores and reads session via SecureStore', async () => {
    await supabaseAuthStorage.setItem(key, '{"access_token":"abc"}');
    await expect(supabaseAuthStorage.getItem(key)).resolves.toBe('{"access_token":"abc"}');
    await expect(SecureStore.getItemAsync(key)).resolves.toBe('{"access_token":"abc"}');
  });

  it('migrates legacy AsyncStorage session into SecureStore', async () => {
    await AsyncStorage.setItem(key, '{"access_token":"legacy"}');
    await expect(supabaseAuthStorage.getItem(key)).resolves.toBe('{"access_token":"legacy"}');
    await expect(SecureStore.getItemAsync(key)).resolves.toBe('{"access_token":"legacy"}');
    await expect(AsyncStorage.getItem(key)).resolves.toBeNull();
  });

  it('removes from both stores', async () => {
    await supabaseAuthStorage.setItem(key, 'x');
    await AsyncStorage.setItem(key, 'y');
    await supabaseAuthStorage.removeItem(key);
    await expect(supabaseAuthStorage.getItem(key)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(key)).resolves.toBeNull();
  });

  it('falls back to AsyncStorage when SecureStore is unavailable', async () => {
    secureStoreMock.__resetSecureStoreMock({ available: false });
    resetSupabaseAuthStorageCacheForTests();

    await supabaseAuthStorage.setItem(key, '{"access_token":"async"}');
    await expect(AsyncStorage.getItem(key)).resolves.toBe('{"access_token":"async"}');
    await expect(SecureStore.getItemAsync(key)).resolves.toBeNull();
    await expect(supabaseAuthStorage.getItem(key)).resolves.toBe('{"access_token":"async"}');
  });

  it('falls back to AsyncStorage when SecureStore write fails', async () => {
    secureStoreMock.__resetSecureStoreMock({ setShouldFail: true });
    resetSupabaseAuthStorageCacheForTests();

    await supabaseAuthStorage.setItem(key, '{"access_token":"fallback"}');
    await expect(AsyncStorage.getItem(key)).resolves.toBe('{"access_token":"fallback"}');
    await expect(supabaseAuthStorage.getItem(key)).resolves.toBe('{"access_token":"fallback"}');
  });
});

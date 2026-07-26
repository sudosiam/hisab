import {
  CLOUD_PASSWORD_MIN_SIGN_IN,
  CLOUD_PASSWORD_MIN_SIGN_UP,
  getCloudOwnerEmail,
  isCloudOwnerLockEnabled,
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from '../cloudBackup';

describe('cloud backup single-owner auth', () => {
  const originalOwner = process.env.EXPO_PUBLIC_CLOUD_OWNER_EMAIL;

  afterEach(() => {
    if (originalOwner === undefined) {
      delete process.env.EXPO_PUBLIC_CLOUD_OWNER_EMAIL;
    } else {
      process.env.EXPO_PUBLIC_CLOUD_OWNER_EMAIL = originalOwner;
    }
  });

  it('requires a strong password floor', () => {
    expect(CLOUD_PASSWORD_MIN_SIGN_IN).toBeGreaterThanOrEqual(10);
    expect(CLOUD_PASSWORD_MIN_SIGN_UP).toBe(CLOUD_PASSWORD_MIN_SIGN_IN);
  });

  it('locks auth to EXPO_PUBLIC_CLOUD_OWNER_EMAIL when set', async () => {
    process.env.EXPO_PUBLIC_CLOUD_OWNER_EMAIL = 'owner@example.com';
    expect(isCloudOwnerLockEnabled()).toBe(true);
    expect(getCloudOwnerEmail()).toBe('owner@example.com');

    const signIn = await signInWithEmailPassword('other@example.com', 'longpassword1');
    expect(signIn.success).toBe(false);
    expect(signIn.message).toMatch(/owner email/i);

    const signUp = await signUpWithEmailPassword('other@example.com', 'longpassword1');
    expect(signUp.success).toBe(false);
    expect(signUp.message).toMatch(/owner email/i);
  });
});

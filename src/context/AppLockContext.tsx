import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import { AppBootScreen } from '../components/AppBootScreen';
import { AppLockScreen } from '../components/AppLockScreen';
import {
  getBiometricCapability,
  disableAppLockIfMisconfigured,
  isAppLockEnabled,
  isAppLockSupported,
  isBiometricUnlockEnabled,
} from '../services/appLock';

/** Stay unlocked if the app is reopened within this window after leaving. */
const LOCK_GRACE_MS = 30_000;

interface AppLockContextValue {
  lockEnabled: boolean;
  locked: boolean;
  biometricEnabled: boolean;
  biometricLabel: string;
  biometricAvailable: boolean;
  lockSupported: boolean;
  unlock: () => void;
  refreshLockSettings: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue>({
  lockEnabled: false,
  locked: false,
  biometricEnabled: false,
  biometricLabel: 'Biometrics',
  biometricAvailable: false,
  lockSupported: false,
  unlock: () => {},
  refreshLockSettings: async () => {},
});

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [lockSupported, setLockSupported] = useState(false);
  const sessionUnlocked = useRef(false);
  const appState = useRef(AppState.currentState);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundAt = useRef<number | null>(null);

  const clearLockTimer = useCallback(() => {
    if (lockTimer.current) {
      clearTimeout(lockTimer.current);
      lockTimer.current = null;
    }
  }, []);

  const lockNow = useCallback(() => {
    clearLockTimer();
    sessionUnlocked.current = false;
    setLocked(true);
  }, [clearLockTimer]);

  const scheduleLockAfterGrace = useCallback(() => {
    clearLockTimer();
    lockTimer.current = setTimeout(() => {
      lockTimer.current = null;
      lockNow();
    }, LOCK_GRACE_MS);
  }, [clearLockTimer, lockNow]);

  const refreshLockSettings = useCallback(async () => {
    const supported = await isAppLockSupported();
    setLockSupported(supported);
    if (!supported) {
      setLockEnabled(false);
      setLocked(false);
      setBiometricEnabled(false);
      setBiometricAvailable(false);
      setInitialized(true);
      return;
    }

    await disableAppLockIfMisconfigured();

    const [enabled, biometric, capability] = await Promise.all([
      isAppLockEnabled(),
      isBiometricUnlockEnabled(),
      getBiometricCapability(),
    ]);

    setLockEnabled(enabled);
    setBiometricEnabled(biometric);
    setBiometricAvailable(capability.available);
    setBiometricLabel(capability.label);

    if (!enabled) {
      setLocked(false);
      sessionUnlocked.current = true;
    } else if (!sessionUnlocked.current) {
      setLocked(true);
    }

    setInitialized(true);
  }, []);

  useEffect(() => {
    refreshLockSettings();
  }, [refreshLockSettings]);

  useEffect(() => {
    if (!lockEnabled) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appState.current === 'active';
      const leavingForeground = nextState === 'inactive' || nextState === 'background';
      const returningActive = nextState === 'active' && !wasActive;

      if (wasActive && leavingForeground) {
        if (backgroundAt.current === null) {
          backgroundAt.current = Date.now();
          scheduleLockAfterGrace();
        }
      }

      if (returningActive) {
        const leftAt = backgroundAt.current;
        backgroundAt.current = null;
        clearLockTimer();

        const awayMs = leftAt != null ? Date.now() - leftAt : 0;
        if (awayMs >= LOCK_GRACE_MS) {
          lockNow();
        }
      }

      appState.current = nextState;
    });

    return () => {
      subscription.remove();
      clearLockTimer();
    };
  }, [clearLockTimer, lockEnabled, lockNow, scheduleLockAfterGrace]);

  const unlock = useCallback(() => {
    sessionUnlocked.current = true;
    setLocked(false);
  }, []);

  const value = useMemo(
    () => ({
      lockEnabled,
      locked,
      biometricEnabled,
      biometricLabel,
      biometricAvailable,
      lockSupported,
      unlock,
      refreshLockSettings,
    }),
    [
      lockEnabled,
      locked,
      biometricEnabled,
      biometricLabel,
      biometricAvailable,
      lockSupported,
      unlock,
      refreshLockSettings,
    ]
  );

  // Load lock settings from SecureStore before showing app content.
  if (!initialized) {
    return (
      <AppLockContext.Provider value={value}>
        <View style={styles.root}>
          <AppBootScreen />
        </View>
      </AppLockContext.Provider>
    );
  }

  const isLocked = lockEnabled && locked;

  return (
    <AppLockContext.Provider value={value}>
      <View style={styles.root}>
        {!isLocked ? children : null}
        {isLocked ? (
          <View style={styles.lockOverlay} accessibilityViewIsModal>
            <AppLockScreen biometricEnabled={biometricEnabled} onUnlock={unlock} />
          </View>
        ) : null}
      </View>
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
});

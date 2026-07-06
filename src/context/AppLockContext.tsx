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

  const scheduleLockAfterGrace = useCallback(() => {
    clearLockTimer();
    lockTimer.current = setTimeout(() => {
      lockTimer.current = null;
      sessionUnlocked.current = false;
      setLocked(true);
    }, LOCK_GRACE_MS);
  }, [clearLockTimer]);

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
      const goingBackground = nextState === 'inactive' || nextState === 'background';
      const returningActive = nextState === 'active' && appState.current !== 'active';

      if (wasActive && goingBackground) {
        backgroundAt.current = Date.now();
        scheduleLockAfterGrace();
      }

      if (returningActive) {
        const leftAt = backgroundAt.current;
        backgroundAt.current = null;
        const awayMs = leftAt != null ? Date.now() - leftAt : LOCK_GRACE_MS;

        clearLockTimer();

        if (awayMs >= LOCK_GRACE_MS) {
          sessionUnlocked.current = false;
          setLocked(true);
        }
      }

      appState.current = nextState;
    });

    return () => {
      subscription.remove();
      clearLockTimer();
    };
  }, [clearLockTimer, lockEnabled, scheduleLockAfterGrace]);

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
        <AppBootScreen />
      </AppLockContext.Provider>
    );
  }

  const isLocked = lockEnabled && locked;

  return (
    <AppLockContext.Provider value={value}>
      <View
        style={[styles.appContainer, isLocked && styles.hidden]}
        pointerEvents={isLocked ? 'none' : 'auto'}
        importantForAccessibility={isLocked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={isLocked}
      >
        {children}
      </View>
      {isLocked ? (
        <View style={[StyleSheet.absoluteFill, styles.lockOverlay]} pointerEvents="auto">
          <AppLockScreen biometricEnabled={biometricEnabled} onUnlock={unlock} />
        </View>
      ) : null}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}

const styles = StyleSheet.create({
  lockOverlay: {
    zIndex: 9999,
    elevation: 9999,
  },
  appContainer: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
});

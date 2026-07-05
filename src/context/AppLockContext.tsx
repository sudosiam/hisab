import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, AppState, View, StyleSheet } from 'react-native';
import { AppLockScreen } from '../components/AppLockScreen';
import {
  getBiometricCapability,
  isAppLockEnabled,
  isAppLockSupported,
  isBiometricUnlockEnabled,
} from '../services/appLock';
import { useDatabase } from './DatabaseContext';

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
  const { ready } = useDatabase();
  const [initialized, setInitialized] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [lockSupported, setLockSupported] = useState(false);
  const sessionUnlocked = useRef(false);
  const appState = useRef(AppState.currentState);

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
    if (ready) {
      refreshLockSettings();
    }
  }, [ready, refreshLockSettings]);

  useEffect(() => {
    if (!lockEnabled) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appState.current === 'active';
      const goingBackground = nextState === 'inactive' || nextState === 'background';
      const returningActive = nextState === 'active' && appState.current !== 'active';

      if (wasActive && goingBackground) {
        sessionUnlocked.current = false;
        // Lock immediately so the OS app-switcher snapshot doesn't leak data.
        setLocked(true);
      }

      if (returningActive && lockEnabled) {
        setLocked(true);
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [lockEnabled]);

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

  // Never render app content before lock settings load — otherwise a cold
  // start briefly exposes data before the lock screen mounts.
  if (!ready || !initialized) {
    return (
      <AppLockContext.Provider value={value}>
        <View style={styles.boot}>
          <ActivityIndicator size="large" />
        </View>
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
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

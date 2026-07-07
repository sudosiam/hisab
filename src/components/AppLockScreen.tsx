import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ActivityIndicator,
  AppState,
  InteractionManager,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  authenticateWithBiometrics,
  clearFailedAttempts,
  getFailedAttemptState,
  PIN_LENGTH,
  prefetchPinMaterial,
  setFailedAttemptState,
  verifyPin,
} from '../services/appLock';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';

interface Props {
  biometricEnabled: boolean;
  onUnlock: () => void;
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const LOCKOUT_SECONDS = 30;
const BIOMETRIC_PROMPT_DELAY_MS = 280;

const SCREEN_WIDTH = Dimensions.get('window').width;
const KEYPAD_WIDTH = Math.min(SCREEN_WIDTH - spacing.lg * 2, 320);
const KEY_SIZE = Math.max(56, Math.floor(KEYPAD_WIDTH / 3));

export function AppLockScreen({ biometricEnabled, onUnlock }: Props) {
  const { colors } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownUntil = useRef(0);
  const shake = useRef(new Animated.Value(0)).current;
  const biometricInFlight = useRef(false);
  const biometricTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const lockedOut = cooldownRemaining > 0;

  useEffect(() => {
    void prefetchPinMaterial();
    let cancelled = false;
    getFailedAttemptState().then((state) => {
      if (cancelled) return;
      setAttempts(state.attempts);
      if (state.cooldownUntil > Date.now()) {
        cooldownUntil.current = state.cooldownUntil;
        setCooldownRemaining(Math.ceil((state.cooldownUntil - Date.now()) / 1000));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldownUntil.current <= Date.now()) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining === 0) {
        cooldownUntil.current = 0;
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [attempts]);

  const runShake = useCallback(() => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  const promptBiometric = useCallback(
    async (delayMs = 0) => {
      if (!biometricEnabled || checking || cooldownUntil.current > Date.now() || biometricInFlight.current) {
        return;
      }

      biometricInFlight.current = true;
      try {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayMs);
          });
        }
        if (!biometricEnabled || checking || cooldownUntil.current > Date.now()) return;

        const ok = await authenticateWithBiometrics({ skipCapabilityCheck: true });
        if (ok) {
          await clearFailedAttempts();
          onUnlock();
        }
      } finally {
        biometricInFlight.current = false;
      }
    },
    [biometricEnabled, checking, onUnlock]
  );

  const scheduleBiometricPrompt = useCallback(
    (delayMs = BIOMETRIC_PROMPT_DELAY_MS) => {
      if (!biometricEnabled || cooldownUntil.current > Date.now()) return;
      if (biometricTimer.current) {
        clearTimeout(biometricTimer.current);
      }
      biometricTimer.current = setTimeout(() => {
        biometricTimer.current = null;
        void promptBiometric(0);
      }, delayMs);
    },
    [biometricEnabled, promptBiometric]
  );

  const tryBiometric = useCallback(() => {
    if (biometricTimer.current) {
      clearTimeout(biometricTimer.current);
      biometricTimer.current = null;
    }
    setError('');
    void promptBiometric(0);
  }, [promptBiometric]);

  const submitPin = useCallback(
    async (value: string) => {
      if (checking || cooldownUntil.current > Date.now()) return;
      setChecking(true);
      setError('');
      try {
        const ok = await verifyPin(value);
        if (ok) {
          setPin('');
          setAttempts(0);
          cooldownUntil.current = 0;
          setCooldownRemaining(0);
          clearFailedAttempts().catch(() => {});
          onUnlock();
          return;
        }
        setPin('');
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        let nextCooldownUntil = 0;
        if (nextAttempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
          const factor = nextAttempts - MAX_ATTEMPTS_BEFORE_LOCKOUT + 1;
          nextCooldownUntil = Date.now() + LOCKOUT_SECONDS * factor * 1000;
          cooldownUntil.current = nextCooldownUntil;
          setCooldownRemaining(LOCKOUT_SECONDS * factor);
          setError(`Too many attempts. Try again in ${LOCKOUT_SECONDS * factor}s`);
        } else {
          setError('Incorrect PIN');
        }
        setFailedAttemptState({ attempts: nextAttempts, cooldownUntil: nextCooldownUntil }).catch(
          () => {}
        );
        runShake();
      } finally {
        setChecking(false);
      }
    },
    [attempts, checking, onUnlock, runShake]
  );

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      submitPin(pin);
    }
  }, [pin, submitPin]);

  useEffect(() => {
    if (!biometricEnabled) return;

    const task = InteractionManager.runAfterInteractions(() => {
      scheduleBiometricPrompt(BIOMETRIC_PROMPT_DELAY_MS);
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        scheduleBiometricPrompt(BIOMETRIC_PROMPT_DELAY_MS);
      }
    });

    return () => {
      task.cancel();
      subscription.remove();
      if (biometricTimer.current) {
        clearTimeout(biometricTimer.current);
        biometricTimer.current = null;
      }
    };
  }, [biometricEnabled, scheduleBiometricPrompt]);

  const onKeyPress = (key: (typeof KEYPAD)[number]) => {
    if (checking || lockedOut) return;
    if (!error.startsWith('Too many')) setError('');
    if (key === 'del') {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    if (key === '' || pin.length >= PIN_LENGTH) return;
    setPin((prev) => prev + key);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.root} collapsable={false}>
        <View style={styles.header}>
          <Text style={styles.brand}>Hisab</Text>
          <Text style={styles.subtitle}>Enter your PIN to continue</Text>

          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shake }] }]}>
            {Array.from({ length: PIN_LENGTH }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index < pin.length && styles.dotFilled,
                  error ? styles.dotError : null,
                  index > 0 ? styles.dotSpacing : null,
                ]}
              />
            ))}
          </Animated.View>

          {lockedOut ? (
            <Text style={styles.error}>Too many attempts. Try again in {cooldownRemaining}s</Text>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Text style={styles.hint}> </Text>
          )}
          {checking ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        </View>

        <View style={styles.keypad} collapsable={false}>
          {KEYPAD.map((key, index) => {
            if (key === '') {
              return <View key={`spacer-${index}`} style={styles.key} />;
            }
            if (key === 'del') {
              return (
                <Pressable
                  key="del"
                  style={({ pressed }) => [styles.key, styles.keyButton, pressed && styles.keyPressed]}
                  onPress={() => onKeyPress('del')}
                  android_ripple={{ color: colors.overlay, borderless: true }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete"
                >
                  <Text style={styles.delText}>⌫</Text>
                </Pressable>
              );
            }
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.key, styles.keyButton, pressed && styles.keyPressed]}
                onPress={() => onKeyPress(key)}
                android_ripple={{ color: colors.overlay, borderless: true }}
                accessibilityRole="button"
                accessibilityLabel={`Digit ${key}`}
              >
                <Text style={styles.keyText}>{key}</Text>
              </Pressable>
            );
          })}
        </View>

        {biometricEnabled ? (
          <Pressable
            style={({ pressed }) => [styles.bioBtn, pressed && styles.keyPressed]}
            onPress={tryBiometric}
            android_ripple={{ color: colors.overlay }}
            accessibilityRole="button"
            accessibilityLabel="Use biometrics"
          >
            <Ionicons name="finger-print-outline" size={22} color={colors.primary} />
            <Text style={styles.bioText}>Use Biometrics</Text>
          </Pressable>
        ) : (
          <View style={styles.bioSpacer} />
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    root: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    header: {
      alignItems: 'center',
      paddingTop: spacing.xl,
      width: '100%',
    },
    brand: {
      ...typography.display,
      fontSize: 32,
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
      textAlign: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    dot: {
      width: 16,
      height: 16,
      borderRadius: radius.full,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    dotSpacing: {
      marginLeft: spacing.md,
    },
    dotFilled: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    dotError: {
      borderColor: colors.danger,
      backgroundColor: colors.danger,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: '600',
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    hint: {
      fontSize: 14,
      marginTop: spacing.xs,
      color: colors.background,
    },
    spinner: {
      marginTop: spacing.sm,
    },
    keypad: {
      width: KEYPAD_WIDTH,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    key: {
      width: KEY_SIZE,
      height: KEY_SIZE,
    },
    keyButton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    keyPressed: {
      backgroundColor: colors.overlay,
    },
    keyText: {
      fontSize: 30,
      fontWeight: '600',
      color: colors.text,
      ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : {}),
    },
    delText: {
      fontSize: 26,
      fontWeight: '600',
      color: colors.text,
      ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : {}),
    },
    bioBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      minHeight: 48,
    },
    bioText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
      marginLeft: spacing.xs,
    },
    bioSpacer: {
      height: 48,
    },
  });
}

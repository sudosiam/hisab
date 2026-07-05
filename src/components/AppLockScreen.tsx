import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  authenticateWithBiometrics,
  clearFailedAttempts,
  getFailedAttemptState,
  PIN_LENGTH,
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

export function AppLockScreen({ biometricEnabled, onUnlock }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownUntil = useRef(0);
  const shake = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const lockedOut = cooldownRemaining > 0;

  // Restore the persisted attempt counter so force-quitting doesn't reset the cooldown.
  useEffect(() => {
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
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [cooldownRemaining, attempts]);

  const runShake = useCallback(() => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  const tryBiometric = useCallback(async () => {
    if (!biometricEnabled || checking) return;
    setError('');
    const ok = await authenticateWithBiometrics();
    if (ok) onUnlock();
  }, [biometricEnabled, checking, onUnlock]);

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
          clearFailedAttempts();
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
        setFailedAttemptState({ attempts: nextAttempts, cooldownUntil: nextCooldownUntil });
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
    if (biometricEnabled) {
      authenticateWithBiometrics().then((ok) => {
        if (ok) onUnlock();
      });
    }
  }, [biometricEnabled, onUnlock]);

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
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom }]}>
      <Text style={styles.brand}>Hisab</Text>
      <Text style={styles.subtitle}>Enter your PIN to continue</Text>

      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length: PIN_LENGTH }).map((_, index) => (
          <View
            key={index}
            style={[styles.dot, index < pin.length && styles.dotFilled, error ? styles.dotError : null]}
          />
        ))}
      </Animated.View>

      {lockedOut ? (
        <Text style={styles.error}>Too many attempts. Try again in {cooldownRemaining}s</Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
      {checking ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} /> : null}

      <View style={styles.keypad}>
        {KEYPAD.map((key, index) => {
          if (key === '') {
            return <View key={`spacer-${index}`} style={styles.key} />;
          }
          if (key === 'del') {
            return (
              <TouchableOpacity
                key="del"
                style={styles.key}
                onPress={() => onKeyPress('del')}
                activeOpacity={0.7}
              >
                <Ionicons name="backspace-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={key}
              style={styles.key}
              onPress={() => onKeyPress(key)}
              activeOpacity={0.7}
            >
              <Text style={styles.keyText}>{key}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {biometricEnabled ? (
        <TouchableOpacity style={styles.bioBtn} onPress={tryBiometric} activeOpacity={0.75}>
          <Ionicons name="finger-print-outline" size={22} color={colors.primary} />
          <Text style={styles.bioText}>Use Biometrics</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    brand: {
      ...typography.display,
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    dot: {
      width: 14,
      height: 14,
      borderRadius: radius.full,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: 'transparent',
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
      fontSize: 13,
      fontWeight: '600',
      marginTop: spacing.xs,
    },
    keypad: {
      marginTop: spacing.xl,
      width: '100%',
      maxWidth: 300,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    key: {
      width: '33.33%',
      aspectRatio: 1.35,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyText: {
      fontSize: 28,
      fontWeight: '500',
      color: colors.text,
    },
    bioBtn: {
      marginTop: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    bioText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
  });
}

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { FormInput, PrimaryButton } from './ui';
import { PIN_LENGTH, isValidPin } from '../services/appLock';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';

export type PinModalMode =
  | 'setup'
  | 'setup-confirm'
  | 'disable'
  | 'change-current'
  | 'change-new'
  | 'change-confirm'
  | 'biometric';

interface Props {
  visible: boolean;
  mode: PinModalMode;
  onClose: () => void;
  onComplete: (payload: { pin: string }) => void | Promise<void>;
}

const TITLES: Record<PinModalMode, string> = {
  setup: 'Create PIN',
  'setup-confirm': 'Confirm PIN',
  disable: 'Turn off app lock',
  'change-current': 'Current PIN',
  'change-new': 'New PIN',
  'change-confirm': 'Confirm new PIN',
  biometric: 'Confirm PIN',
};

const SUBTITLES: Record<PinModalMode, string> = {
  setup: `Choose a ${PIN_LENGTH}-digit PIN`,
  'setup-confirm': 'Enter the same PIN again',
  disable: 'Enter your PIN to turn off app lock',
  'change-current': 'Enter your current PIN',
  'change-new': `Choose a new ${PIN_LENGTH}-digit PIN`,
  'change-confirm': 'Enter the same PIN again',
  biometric: 'Enter your PIN to change biometric unlock',
};

export function PinEntryModal({ visible, mode, onClose, onComplete }: Props) {
  const { colors, isDark } = useTheme();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    if (visible) {
      setPin('');
      setError('');
      setLoading(false);
    }
  }, [visible, mode]);

  const submit = async () => {
    if (!isValidPin(pin)) {
      setError(`Enter a ${PIN_LENGTH}-digit PIN`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onComplete({ pin });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{TITLES[mode]}</Text>
          <Text style={styles.subtitle}>{SUBTITLES[mode]}</Text>
          <FormInput
            label="PIN"
            value={pin}
            onChangeText={(value) => {
              setPin(value.replace(/\D/g, '').slice(0, PIN_LENGTH));
              setError('');
            }}
            placeholder={'•'.repeat(PIN_LENGTH)}
            keyboardType="numeric"
            secureTextEntry
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Continue" onPress={submit} loading={loading} disabled={!pin} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      ...cardSurface(colors, isDark),
      padding: spacing.lg,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    error: {
      color: colors.danger,
      fontSize: 13,
      marginTop: spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    cancel: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
  });
}

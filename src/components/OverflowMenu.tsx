import React, { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../constants/theme';

export type OverflowAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

interface Props {
  actions: OverflowAction[];
  accessibilityLabel?: string;
}

export function OverflowMenu({ actions, accessibilityLabel = 'More actions' }: Props) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const runAction = useCallback((action: OverflowAction) => {
    setOpen(false);
    // Defer so the modal/sheet can close before alerts/navigation.
    requestAnimationFrame(() => action.onPress());
  }, []);

  const openMenu = useCallback(() => {
    if (actions.length === 0) return;

    if (Platform.OS === 'ios') {
      const destructiveIndexes = actions
        .map((a, i) => (a.destructive ? i : -1))
        .filter((i) => i >= 0);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...actions.map((a) => a.label), 'Cancel'],
          cancelButtonIndex: actions.length,
          ...(destructiveIndexes.length === 1
            ? { destructiveButtonIndex: destructiveIndexes[0] }
            : destructiveIndexes.length > 1
              ? { destructiveButtonIndex: destructiveIndexes }
              : null),
        },
        (buttonIndex) => {
          if (buttonIndex == null || buttonIndex >= actions.length) return;
          runAction(actions[buttonIndex]);
        }
      );
      return;
    }

    setOpen(true);
  }, [actions, runAction]);

  return (
    <>
      <Pressable
        onPress={openMenu}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.trigger, pressed ? { opacity: 0.65 } : null]}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.primary} />
      </Pressable>

      {Platform.OS !== 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              {actions.map((action, index) => (
                <TouchableOpacity
                  key={`${action.label}-${index}`}
                  style={[styles.option, index < actions.length - 1 && styles.optionBorder]}
                  onPress={() => runAction(action)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      action.destructive ? { color: colors.danger } : null,
                    ]}
                  >
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.option, styles.cancelOption]}
                onPress={() => setOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean
) {
  return StyleSheet.create({
    trigger: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
      padding: spacing.md,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
    },
    option: {
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
    },
    optionBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    optionText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    cancelOption: {
      marginTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLight,
      backgroundColor: colors.surfaceContainer,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
}

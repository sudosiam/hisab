import React, { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../constants/theme';
import { HeaderIconButton } from './HeaderIconButton';

export type OverflowAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

interface Props {
  actions: OverflowAction[];
  accessibilityLabel?: string;
  /** When this is the last (or only) header control. */
  trailing?: boolean;
}

export function OverflowMenu({
  actions,
  accessibilityLabel = 'More actions',
  trailing = true,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const runAction = useCallback((action: OverflowAction) => {
    setOpen(false);
    // Defer so the modal/sheet can close before alerts/navigation.
    requestAnimationFrame(() => action.onPress());
  }, []);

  const openMenu = useCallback(() => {
    if (actions.length === 0) return;
    void import('../utils/haptics').then((m) => m.hapticLight());

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
      <HeaderIconButton
        name="ellipsis-vertical"
        tintColor={colors.headerText}
        onPress={openMenu}
        accessibilityLabel={accessibilityLabel}
        trailing={trailing}
      />

      {Platform.OS !== 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable
              style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.grabber} />
              {actions.map((action, index) => (
                <TouchableOpacity
                  key={`${action.label}-${index}`}
                  style={[styles.option, index < actions.length - 1 && styles.optionBorder]}
                  onPress={() => {
                    void import('../utils/haptics').then((m) =>
                      action.destructive ? m.hapticWarning() : m.hapticLight()
                    );
                    runAction(action);
                  }}
                  activeOpacity={0.75}
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
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
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
      paddingTop: spacing.xs,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.xs,
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

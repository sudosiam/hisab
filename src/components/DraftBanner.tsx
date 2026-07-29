import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';

interface Props {
  visible: boolean;
  onDiscard: () => void;
}

/** Floating footer chip — does not insert into ScrollView (avoids shoving the form down). */
export function DraftBanner({ visible, onDiscard }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.primaryContainer,
          borderRadius: radius.full,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginHorizontal: spacing.md,
          marginBottom: Math.max(insets.bottom, spacing.sm),
          minHeight: 40,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          ...(isDark
            ? {}
            : {
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              }),
        },
        text: {
          flex: 1,
          ...typography.caption,
          color: colors.onPrimaryContainer,
          marginRight: spacing.sm,
          fontWeight: '600',
        },
        discard: {
          ...typography.caption,
          fontWeight: '700',
          color: colors.danger,
        },
      }),
    [colors, isDark, insets.bottom]
  );

  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Text style={styles.text}>Draft saved</Text>
      <TouchableOpacity
        onPress={onDiscard}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Discard draft"
      >
        <Text style={styles.discard}>Discard</Text>
      </TouchableOpacity>
    </View>
  );
}

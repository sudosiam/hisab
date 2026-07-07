import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';

interface Props {
  visible: boolean;
  onDiscard: () => void;
}

export function DraftBanner({ visible, onDiscard }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? colors.navActive : colors.chip,
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: colors.borderLight,
        },
        text: {
          flex: 1,
          fontSize: 13,
          color: colors.textSecondary,
          marginRight: spacing.sm,
        },
        discard: {
          fontSize: 13,
          fontWeight: '700',
          color: colors.danger,
        },
      }),
    [colors, isDark]
  );

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>Draft saved automatically</Text>
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

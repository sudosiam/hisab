import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';

interface Props {
  visible: boolean;
  onDiscard: () => void;
}

export function DraftBanner({ visible, onDiscard }: Props) {
  const { colors } = useTheme();
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
          marginBottom: spacing.md,
          minHeight: 40,
        },
        text: {
          flex: 1,
          fontSize: 12,
          color: colors.onPrimaryContainer,
          marginRight: spacing.sm,
          fontWeight: '500',
        },
        discard: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.danger,
        },
      }),
    [colors]
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

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { MoneyText } from './MoneyText';

interface Props {
  label: string;
  value?: number;
  /** Override formatted currency (e.g. qty, count, text). */
  displayValue?: string;
  color?: string;
  subtitle?: string;
  onPress?: () => void;
  style?: import('react-native').ViewStyle;
}

export function StatCard({ label, value, displayValue, color, subtitle, onPress, style }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const accent = color ?? colors.primary;

  const body = (
    <>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <MoneyText
        amount={value ?? 0}
        text={displayValue}
        size="md"
        color={accent}
        style={{ width: '100%', textAlign: 'left' }}
        lines={2}
      />
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {body}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.card, style]}>{body}</View>;
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, isDark),
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: 0,
      maxWidth: '100%',
      minHeight: 56,
      justifyContent: 'center',
      overflow: 'visible',
    },
    label: {
      fontSize: 10,
      color: colors.textSecondary,
      marginBottom: 2,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    subtitle: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
}

export function StatCard({ label, value, displayValue, color, subtitle }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const accent = color ?? colors.primary;

  return (
    <View style={styles.card}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <MoneyText amount={value ?? 0} text={displayValue} size="lg" color={accent} />
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, isDark),
      padding: spacing.md,
      flex: 1,
      minWidth: '45%',
      minHeight: 0,
    },
    label: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 6,
      fontWeight: '500',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    subtitle: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
  });
}

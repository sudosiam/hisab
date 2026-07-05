import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, typography } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { formatCurrency } from '../utils/format';

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
  const formatted = displayValue ?? formatCurrency(value ?? 0);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accent }]}>{formatted}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
    },
    label: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      fontWeight: '600',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    value: {
      ...typography.metric,
    },
    subtitle: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
  });
}

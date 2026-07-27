import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { MoneyText } from './MoneyText';
import { ThemedPressable, ACTIVE_OPACITY } from './ThemedPressable';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  label: string;
  value?: number;
  /** Override formatted currency (e.g. qty, count, text). */
  displayValue?: string;
  color?: string;
  subtitle?: string;
  onPress?: () => void;
  style?: ViewStyle;
  /** Blur the value for privacy (dashboard hide-amounts). */
  blurred?: boolean;
  /** Stretch equally in a flex row (dashboard 2-col grids). */
  equal?: boolean;
  /** Optional leading icon. */
  icon?: IconName;
  /**
   * `card` — elevated surface (default).
   * `inset` — tonal tile for use inside a parent panel (no nested elevation).
   */
  variant?: 'card' | 'inset';
}

export function StatCard({
  label,
  value,
  displayValue,
  color,
  subtitle,
  onPress,
  style,
  blurred = false,
  equal = false,
  icon,
  variant = 'card',
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const accent = color ?? colors.primary;

  const body = (
    <>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.labelRow}>
          {icon ? (
            <Ionicons name={icon} size={14} color={accent} style={styles.icon} />
          ) : null}
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <MoneyText
          amount={value ?? 0}
          text={displayValue}
          size="md"
          color={colors.text}
          style={{ width: '100%', textAlign: 'left' }}
          lines={1}
          blurred={blurred}
        />
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </>
  );

  const cardStyle = [
    variant === 'inset' ? styles.inset : styles.card,
    equal && styles.equal,
    style,
  ];

  if (onPress) {
    return (
      <ThemedPressable
        style={cardStyle}
        onPress={onPress}
        activeOpacity={ACTIVE_OPACITY}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {body}
      </ThemedPressable>
    );
  }

  return <View style={cardStyle}>{body}</View>;
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, isDark),
      flexDirection: 'row',
      alignItems: 'stretch',
      overflow: 'hidden',
      flexGrow: 1,
      flexShrink: 1,
      // ~3-up on detail KPI rows; `equal` overrides for dashboard 2-col.
      flexBasis: '31%',
      minWidth: 96,
      maxWidth: '100%',
      minHeight: 76,
    },
    inset: {
      flexDirection: 'row',
      alignItems: 'stretch',
      overflow: 'hidden',
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: '31%',
      minWidth: 96,
      maxWidth: '100%',
      minHeight: 76,
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: radius.md,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.border,
    },
    equal: {
      flex: 1,
      flexBasis: 0,
      flexGrow: 1,
      minWidth: 0,
      maxWidth: undefined,
    },
    accent: {
      width: 3,
      alignSelf: 'stretch',
    },
    body: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm + 2,
      justifyContent: 'center',
      gap: 4,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minWidth: 0,
    },
    icon: {
      marginTop: 1,
    },
    label: {
      ...typography.micro,
      color: colors.textSecondary,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      flexShrink: 1,
    },
    subtitle: {
      ...typography.micro,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}

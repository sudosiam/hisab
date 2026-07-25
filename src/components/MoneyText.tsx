import React from 'react';
import { Text, View, type StyleProp, type TextStyle, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/format';
import { typography } from '../constants/theme';

export type MoneyTextSize = 'sm' | 'md' | 'lg' | 'hero';

const SIZE_STYLES: Record<MoneyTextSize, TextStyle> = {
  sm: { fontSize: 12, fontWeight: '600', letterSpacing: -0.2 },
  md: { fontSize: 14, fontWeight: '600', letterSpacing: -0.25 },
  lg: { ...typography.metric, fontSize: 17 },
  hero: { ...typography.display, fontSize: 20 },
};

const HIDDEN_MASK: Record<MoneyTextSize, string> = {
  sm: '••••',
  md: '••••••',
  lg: '••••••',
  hero: '••••••••',
};

const styles = StyleSheet.create({
  base: {
    fontVariant: ['tabular-nums'],
  },
});

interface MoneyTextProps {
  amount: number;
  /** Pre-formatted string (skips formatCurrency). */
  text?: string;
  size?: MoneyTextSize;
  color?: string;
  style?: StyleProp<TextStyle>;
  /**
   * Lines before shrinking further. Default 2 so large INR amounts wrap
   * instead of clipping when the column is narrow.
   */
  lines?: 1 | 2;
  minimumFontScale?: number;
  /** When true, amount is replaced with a privacy mask. */
  blurred?: boolean;
}

/**
 * Currency that prefers shrink-to-fit + wrap over ellipsis.
 * Give the parent a bounded width (or wrap with moneyRowStyles.right).
 */
export function MoneyText({
  amount,
  text,
  size = 'md',
  color,
  style,
  lines = 2,
  minimumFontScale = 0.5,
  blurred = false,
}: MoneyTextProps) {
  const { colors } = useTheme();
  const value = blurred ? HIDDEN_MASK[size] : (text ?? formatCurrency(amount));
  const ink = color ?? colors.text;

  return (
    <Text
      style={[
        styles.base,
        SIZE_STYLES[size],
        { color: ink, textAlign: 'right' },
        style,
        blurred ? { letterSpacing: 1.5, opacity: 0.45 } : null,
      ]}
      numberOfLines={lines}
      adjustsFontSizeToFit={!blurred}
      minimumFontScale={minimumFontScale}
      accessibilityLabel={blurred ? 'Amount hidden' : undefined}
    >
      {value}
    </Text>
  );
}

/** Shared row chrome: left text yields space; right keeps amounts fully visible. */
export const moneyRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  left: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  /** Amount column — can shrink/wrap, never clipped by a hard % that fights content. */
  right: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 88,
    maxWidth: '62%',
    alignItems: 'flex-end',
  },
});

/** Period / section total row: label left, MoneyText right — no overflow. */
export function MoneyTotalRow({
  label,
  amount,
  amountColor,
  labelStyle,
  style,
}: {
  label: string;
  amount: number;
  amountColor?: string;
  labelStyle?: StyleProp<TextStyle>;
  style?: StyleProp<import('react-native').ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[moneyRowStyles.row, { alignItems: 'center', marginBottom: 4 }, style]}>
      <Text
        style={[{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: colors.text }, labelStyle]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={moneyRowStyles.right}>
        <MoneyText
          amount={amount}
          size="md"
          color={amountColor}
          style={{ width: '100%' }}
          lines={2}
        />
      </View>
    </View>
  );
}

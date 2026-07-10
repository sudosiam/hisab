import React from 'react';
import { Text, type StyleProp, type TextStyle, StyleSheet } from 'react-native';
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
  /** Allow two lines before shrinking (dense tables). */
  lines?: 1 | 2;
  minimumFontScale?: number;
}

export function MoneyText({
  amount,
  text,
  size = 'md',
  color,
  style,
  lines = 1,
  minimumFontScale = 0.62,
}: MoneyTextProps) {
  const { colors } = useTheme();
  const value = text ?? formatCurrency(amount);

  return (
    <Text
      style={[
        styles.base,
        SIZE_STYLES[size],
        { color: color ?? colors.text },
        style,
      ]}
      numberOfLines={lines}
      adjustsFontSizeToFit
      minimumFontScale={minimumFontScale}
    >
      {value}
    </Text>
  );
}

/** Left label column — prevents long text from pushing amounts off-screen. */
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
  right: {
    flexShrink: 0,
    maxWidth: '52%',
    alignItems: 'flex-end',
  },
  rightWide: {
    flexShrink: 0,
    maxWidth: '58%',
    alignItems: 'flex-end',
  },
});

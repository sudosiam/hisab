import React from 'react';
import { Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../constants/theme';
import { MoneyText, moneyRowStyles } from './MoneyText';

interface ReportRowProps {
  children: React.ReactNode;
  amount: number;
  amountColor?: string;
  /** Extra content above amount (e.g. status badge). */
  trailing?: React.ReactNode;
  style?: ViewStyle;
  /** When set, the whole row is tappable (navigate to detail). */
  onPress?: () => void;
  accessibilityLabel?: string;
  showChevron?: boolean;
}

export function ReportRow({
  children,
  amount,
  amountColor,
  trailing,
  style,
  onPress,
  accessibilityLabel,
  showChevron,
}: ReportRowProps) {
  const { colors } = useTheme();
  const showArrow = showChevron ?? !!onPress;

  const content = (
    <View style={[moneyRowStyles.row, { alignItems: 'flex-start' }, !onPress && style]}>
      <View style={moneyRowStyles.left}>{children}</View>
      <View style={[moneyRowStyles.right, { gap: 2 }]}>
        {trailing}
        <MoneyText amount={amount} size="md" color={amountColor} style={{ width: '100%' }} />
      </View>
      {showArrow ? (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={colors.textMuted}
          style={{ marginLeft: spacing.xs, marginTop: 2, flexShrink: 0 }}
        />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[{ overflow: 'visible' }, style]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

interface SummaryChipProps {
  label: string;
  amount: number;
  amountColor?: string;
  style?: ViewStyle;
}

export function SummaryMoneyChip({ label, amount, amountColor, style }: SummaryChipProps) {
  const { colors } = useTheme();
  return (
    <View style={[{ flex: 1, minWidth: 0 }, style]}>
      <Text
        style={{
          fontSize: 10,
          fontWeight: '500',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          color: colors.textMuted,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <MoneyText
        amount={amount}
        size="md"
        color={amountColor}
        style={{ marginTop: 2, width: '100%', textAlign: 'left' }}
      />
    </View>
  );
}

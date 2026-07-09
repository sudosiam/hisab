import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MoneyText, moneyRowStyles } from './MoneyText';

interface ReportRowProps {
  children: React.ReactNode;
  amount: number;
  amountColor?: string;
  /** Extra content above amount (e.g. status badge). */
  trailing?: React.ReactNode;
  style?: ViewStyle;
}

export function ReportRow({ children, amount, amountColor, trailing, style }: ReportRowProps) {
  return (
    <View style={[moneyRowStyles.row, style]}>
      <View style={moneyRowStyles.left}>{children}</View>
      <View style={moneyRowStyles.right}>
        {trailing}
        <MoneyText amount={amount} size="md" color={amountColor} />
      </View>
    </View>
  );
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
        style={{ marginTop: 2, textAlign: 'left' }}
      />
    </View>
  );
}

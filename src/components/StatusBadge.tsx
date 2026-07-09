import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { getPaymentStatusLabel } from '../utils/format';

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const { colors } = useTheme();

  const color =
    status === 'paid'
      ? colors.paid
      : status === 'partial'
        ? colors.partial
        : status === 'unpaid'
          ? colors.unpaid
          : colors.textSecondary;

  return (
    <View style={[styles.badge, { borderColor: color + '44' }]}>
      <Text style={[styles.text, { color }]}>{getPaymentStatusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});

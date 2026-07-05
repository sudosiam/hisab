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
    <View style={[styles.badge, { backgroundColor: color + '18', borderColor: color + '33' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{getPaymentStatusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    borderWidth: 1,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

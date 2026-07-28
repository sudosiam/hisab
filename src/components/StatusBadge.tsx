import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { getPaymentStatusLabel } from '../utils/format';

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const tone =
    status === 'paid'
      ? { bg: colors.surfaceContainerHigh, fg: colors.paid }
      : status === 'partial'
        ? { bg: colors.surfaceContainerHigh, fg: colors.partial }
        : status === 'unpaid'
          ? { bg: colors.surfaceContainerHigh, fg: colors.unpaid }
          : { bg: colors.surfaceContainerHigh, fg: colors.textSecondary };

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{getPaymentStatusLabel(status)}</Text>
    </View>
  );
}

function createStyles(_colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.sm,
      alignSelf: 'flex-end',
      borderWidth: StyleSheet.hairlineWidth,
    },
    text: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
  });
}

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
      ? { bg: colors.success + '33', fg: colors.paid }
      : status === 'partial'
        ? { bg: colors.warning + '40', fg: colors.partial }
        : status === 'unpaid'
          ? { bg: colors.danger + '33', fg: colors.unpaid }
          : { bg: colors.surfaceContainer, fg: colors.textSecondary };

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{getPaymentStatusLabel(status)}</Text>
    </View>
  );
}

function createStyles(_colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
      alignSelf: 'flex-end',
    },
    text: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
  });
}

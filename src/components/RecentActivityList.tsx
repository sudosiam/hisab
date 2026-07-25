import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { formatDisplayDate } from '../utils/date';
import { spacing } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { MoneyText, moneyRowStyles } from './MoneyText';
import type { ActivityItem } from '../services/activity';

const ROUTES: Record<ActivityItem['type'], (id: number) => string> = {
  sale: (id) => `/(drawer)/sales/${id}`,
  purchase: (id) => `/(drawer)/purchases/${id}`,
  expense: (id) => `/(drawer)/expense/${id}`,
};

export function RecentActivityList({ items }: { items: ActivityItem[] }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (items.length === 0) {
    return <Text style={styles.empty}>No recent activity yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.row, index === items.length - 1 && styles.rowLast]}
          onPress={() => router.push(ROUTES[item.type](item.refId) as never)}
          activeOpacity={0.75}
        >
          <View style={styles.rowLeft}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {item.subtitle} · {formatDisplayDate(item.date)}
            </Text>
          </View>
          <View style={styles.amountCol}>
            <MoneyText amount={item.amount} size="md" style={{ width: '100%' }} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    list: {
      ...cardSurface(colors, isDark),
      paddingHorizontal: spacing.md,
      // Clip only for card radius — rows use visible overflow via padding growth.
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 8,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      gap: spacing.sm,
    },
    rowLeft: { flex: 1, minWidth: 0 },
    rowLast: {
      borderBottomWidth: 0,
    },
    title: { fontSize: 13, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 1, lineHeight: 15 },
    amountCol: {
      ...moneyRowStyles.right,
    },
    empty: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
}

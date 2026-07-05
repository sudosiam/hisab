import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { formatCurrency } from '../utils/format';
import type { ActivityItem } from '../services/activity';

const ICONS: Record<ActivityItem['type'], React.ComponentProps<typeof Ionicons>['name']> = {
  sale: 'cart-outline',
  purchase: 'bag-handle-outline',
  expense: 'receipt-outline',
};

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
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.row}
          onPress={() => router.push(ROUTES[item.type](item.refId) as never)}
          activeOpacity={0.75}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={ICONS[item.type]} size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle} · {item.date}
            </Text>
          </View>
          <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    list: {
      ...cardSurface(colors, isDark),
      padding: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.navActive,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    title: { fontSize: 14, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    amount: { fontSize: 14, fontWeight: '700', color: colors.text, marginLeft: spacing.sm },
    empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
  });
}

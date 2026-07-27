import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { formatDisplayDate } from '../utils/date';
import { formatCurrency } from '../utils/format';
import { spacing, typography, radius } from '../constants/theme';
import { ACTIVE_OPACITY, ICON } from './ui';
import { ThemedPressable } from './ThemedPressable';
import { cardSurface } from '../constants/shadows';
import { MoneyText, moneyRowStyles } from './MoneyText';
import type { ActivityItem, GroupedRecentActivity } from '../services/activity';

const DRAWER_STACK: Record<ActivityItem['type'], string> = {
  sale: 'sales',
  purchase: 'purchases',
  expense: 'expense',
};

const SECTION_META: {
  key: keyof GroupedRecentActivity;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'sales', title: 'Sales', icon: 'cart-outline' },
  { key: 'purchases', title: 'Purchases', icon: 'bag-handle-outline' },
  { key: 'expenses', title: 'Expenses', icon: 'receipt-outline' },
];

function openActivityDetail(
  navigation: NavigationProp<ParamListBase>,
  item: ActivityItem
): void {
  const stack = DRAWER_STACK[item.type];
  navigation.dispatch(
    CommonActions.navigate({
      name: stack,
      params: {
        state: {
          routes: [
            { name: 'index' },
            { name: '[id]', params: { id: String(item.refId) } },
          ],
          index: 1,
        },
      },
    })
  );
}

function activityAccessibilityLabel(item: ActivityItem): string {
  const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
  const party = item.subtitle.includes(' · ')
    ? item.subtitle.split(' · ').slice(1).join(' · ')
    : item.subtitle;
  return `${typeLabel} · ${party} · ${formatCurrency(item.amount)} · ${formatDisplayDate(item.date)}`;
}

const ActivityRow = memo(function ActivityRow({
  item,
  isLast,
  styles,
  amountsHidden,
  icon,
}: {
  item: ActivityItem;
  isLast: boolean;
  styles: ReturnType<typeof createStyles>;
  amountsHidden?: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { colors } = useTheme();
  return (
    <ThemedPressable
      style={[styles.row, isLast && styles.rowLast]}
      onPress={() => openActivityDetail(navigation, item)}
      activeOpacity={ACTIVE_OPACITY}
      accessibilityRole="button"
      accessibilityLabel={activityAccessibilityLabel(item)}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={ICON.inline} color={colors.onPrimaryContainer} />
      </View>
      <View style={styles.rowLeft}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {item.subtitle} · {formatDisplayDate(item.date)}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <MoneyText
          amount={item.amount}
          size="md"
          style={{ width: '100%' }}
          lines={1}
          blurred={amountsHidden}
        />
      </View>
    </ThemedPressable>
  );
});

/** Flat list (legacy). Prefer `grouped` on the dashboard. */
export function RecentActivityList({
  items,
  grouped,
  amountsHidden = false,
}: {
  items?: ActivityItem[];
  grouped?: GroupedRecentActivity;
  /** Blur amounts for privacy (dashboard hide-amounts). */
  amountsHidden?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (grouped) {
    const hasAny =
      grouped.sales.length > 0 || grouped.purchases.length > 0 || grouped.expenses.length > 0;
    if (!hasAny) {
      return (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>No recent activity yet.</Text>
        </View>
      );
    }

    return (
      <View style={styles.stack}>
        {SECTION_META.map(({ key, title, icon }) => {
          const sectionItems = grouped[key];
          if (sectionItems.length === 0) return null;
          return (
            <View key={key} style={styles.list}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.sectionCount}>{sectionItems.length}</Text>
              </View>
              {sectionItems.map((item, index) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  isLast={index === sectionItems.length - 1}
                  styles={styles}
                  amountsHidden={amountsHidden}
                  icon={icon}
                />
              ))}
            </View>
          );
        })}
      </View>
    );
  }

  const list = items ?? [];
  if (list.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.empty}>No recent activity yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {list.map((item, index) => (
        <ActivityRow
          key={item.id}
          item={item}
          isLast={index === list.length - 1}
          styles={styles}
          amountsHidden={amountsHidden}
          icon={
            item.type === 'sale'
              ? 'cart-outline'
              : item.type === 'purchase'
                ? 'bag-handle-outline'
                : 'receipt-outline'
          }
        />
      ))}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    stack: { gap: spacing.sm },
    list: {
      ...cardSurface(colors, isDark),
      paddingHorizontal: spacing.sm,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    sectionTitle: {
      ...typography.micro,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    sectionCount: {
      ...typography.micro,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      gap: spacing.sm,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    rowLeft: { flex: 1, minWidth: 0 },
    rowLast: {
      borderBottomWidth: 0,
    },
    title: { ...typography.bodyMedium, fontWeight: '600', color: colors.text },
    subtitle: { ...typography.micro, color: colors.textSecondary, marginTop: 2 },
    amountCol: {
      ...moneyRowStyles.right,
      width: 100,
    },
    emptyBox: {
      ...cardSurface(colors, isDark),
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    empty: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}

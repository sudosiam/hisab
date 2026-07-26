import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { formatDisplayDate } from '../utils/date';
import { spacing } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { MoneyText, moneyRowStyles } from './MoneyText';
import type { ActivityItem, GroupedRecentActivity } from '../services/activity';

const DRAWER_STACK: Record<ActivityItem['type'], string> = {
  sale: 'sales',
  purchase: 'purchases',
  expense: 'expense',
};

const SECTIONS: { key: keyof GroupedRecentActivity; title: string }[] = [
  { key: 'sales', title: 'Sales' },
  { key: 'purchases', title: 'Purchases' },
  { key: 'expenses', title: 'Expenses' },
];

function openActivityDetail(
  navigation: NavigationProp<ParamListBase>,
  item: ActivityItem
): void {
  const stack = DRAWER_STACK[item.type];
  // Open detail with a clean nested stack [list → detail] so back never hits a
  // stale New/Edit screen left from an earlier visit.
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

function ActivityRow({
  item,
  isLast,
  styles,
  amountsHidden,
}: {
  item: ActivityItem;
  isLast: boolean;
  styles: ReturnType<typeof createStyles>;
  amountsHidden?: boolean;
}) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={() => openActivityDetail(navigation, item)}
      activeOpacity={0.75}
    >
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
    </TouchableOpacity>
  );
}

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
      return <Text style={styles.empty}>No recent activity yet.</Text>;
    }

    return (
      <View style={styles.stack}>
        {SECTIONS.map(({ key, title }) => {
          const sectionItems = grouped[key];
          if (sectionItems.length === 0) return null;
          return (
            <View key={key} style={styles.list}>
              <Text style={styles.sectionTitle}>{title}</Text>
              {sectionItems.map((item, index) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  isLast={index === sectionItems.length - 1}
                  styles={styles}
                  amountsHidden={amountsHidden}
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
    return <Text style={styles.empty}>No recent activity yet.</Text>;
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
      paddingHorizontal: spacing.md,
      overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      paddingTop: spacing.sm,
      paddingBottom: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      minHeight: 36,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      gap: spacing.sm,
    },
    rowLeft: { flex: 1, minWidth: 0 },
    rowLast: {
      borderBottomWidth: 0,
      paddingBottom: spacing.sm,
    },
    title: { fontSize: 13, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
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

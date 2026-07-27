import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { ListItem } from '../../../src/components/ListItem';
import { MoneyText, MoneyTotalRow } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { ErrorState, EmptyState, Fab, SearchField, SectionHeader, useScreenStyles, useFabListPadding } from '../../../src/components/ui';
import { getExpenses } from '../../../src/services/banking';
import { matchesSearch } from '../../../src/utils/search';
import { formatDisplayDate, getPeriodTotalLabel } from '../../../src/utils/date';
import { useTheme } from '../../../src/context/ThemeContext';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';
import type { Expense } from '../../../src/types';

export default function ExpenseListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const styles = useScreenStyles();
  const fabListPadding = useFabListPadding();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        categoryCard: {
          ...cardSurface(colors, isDark),
          paddingVertical: spacing.xs,
          marginBottom: spacing.sm,
          overflow: 'hidden',
        },
        categoryRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 44,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderLight,
        },
        categoryRowLast: { borderBottomWidth: 0 },
        categoryPct: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
      }),
    [colors, isDark]
  );

  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setExpenses(await getExpenses(monthKey));
  }, [monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, monthKey]);

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((item) =>
        matchesSearch(search, [
          item.category,
          item.description,
          item.date,
          item.account_name,
          item.recurrence,
        ])
      ),
    [expenses, search]
  );

  const monthTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      const key = e.category.trim() || 'Uncategorized';
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  const renderItem = useCallback(
    ({ item }: { item: Expense }) => (
      <ListItem
        title={item.category}
        subtitle={item.description}
        meta={`${formatDisplayDate(item.date)} · ${item.account_name}${
          item.is_recurring ? ` · Recurring` : ''
        }`}
        amount={item.amount}
        onPress={() => router.push(`/(drawer)/expense/${item.id}` as never)}
        accessibilityLabel={`Expense ${item.category}`}
      />
    ),
    [router]
  );

  if (error && expenses.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  const header = (
    <View>
      <MonthPicker monthKey={monthKey} onChange={setMonthKey} />

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search category, description, account..."
      />

      <MoneyTotalRow
        label={search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
        amount={monthTotal}
      />

      {!booting && categoryTotals.length > 0 ? (
        <>
          <SectionHeader title="By Category" />
          <View style={localStyles.categoryCard}>
            {categoryTotals.map((row, index) => {
              const pct = monthTotal > 0 ? (row.total / monthTotal) * 100 : 0;
              return (
                <View
                  key={row.category}
                  style={[
                    localStyles.categoryRow,
                    index === categoryTotals.length - 1 && localStyles.categoryRowLast,
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0, marginRight: spacing.sm }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {row.category}
                    </Text>
                    <Text style={localStyles.categoryPct}>{pct.toFixed(0)}% of period</Text>
                  </View>
                  <View style={{ maxWidth: '48%', minWidth: 80, flexShrink: 1 }}>
                    <MoneyText amount={row.total} size="md" style={{ width: '100%' }} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionHeader title="Expenses" />
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={booting && expenses.length === 0 ? [] : filteredExpenses}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingTop: spacing.sm, paddingBottom: fabListPadding }]}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load()
                .catch((e) => alertRefreshFailed(e))
                .finally(() => setRefreshing(false));
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        ListEmptyComponent={
          booting && expenses.length === 0 ? (
            <ListSkeleton />
          ) : search.trim() ? (
            <EmptyState
              title="No matches"
              message="Try a different search."
            />
          ) : (
            <EmptyState
              title="No expenses yet"
              message="Record expenses for this period."
              actionLabel="Add Expense"
              onAction={() => router.push('/(drawer)/expense/new' as never)}
            />
          )
        }
      />

      <Fab label="+ Add Expense" onPress={() => router.push('/(drawer)/expense/new' as never)} />
    </View>
  );
}

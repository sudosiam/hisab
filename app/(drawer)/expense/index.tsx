import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { ErrorState, SearchField, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { getExpenses } from '../../../src/services/banking';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { getPeriodTotalLabel } from '../../../src/utils/date';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing, radius } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import type { Expense } from '../../../src/types';

export default function ExpenseListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        fab: {
          position: 'absolute',
          bottom: spacing.lg,
          right: spacing.lg,
          backgroundColor: colors.primary,
          paddingHorizontal: spacing.lg,
          paddingVertical: 14,
          borderRadius: radius.xl,
        },
        fabText: { color: colors.onPrimary, fontWeight: '700' },
        expenseRow: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        recurring: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 4 },
        categoryCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.sm,
          marginBottom: spacing.sm,
        },
        categoryRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        categoryRowLast: { borderBottomWidth: 0 },
        categoryPct: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
      <TouchableOpacity
        style={localStyles.expenseRow}
        onPress={() => router.push(`/(drawer)/expense/${item.id}` as never)}
        activeOpacity={0.75}
      >
        <View style={styles.row}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.category}
          </Text>
          <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
        </View>
        <Text style={styles.cardSub} numberOfLines={2}>
          {item.description}
        </Text>
        <Text style={styles.cardSub}>
          {item.date} · {item.account_name}
        </Text>
        {item.is_recurring ? (
          <Text style={localStyles.recurring}>Recurring · {item.recurrence ?? 'Monthly'}</Text>
        ) : null}
      </TouchableOpacity>
    ),
    [localStyles, router, styles]
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

      <View style={styles.row}>
        <Text style={styles.cardTitle}>
          {search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
        </Text>
        <Text style={styles.amount}>{formatCurrency(monthTotal)}</Text>
      </View>

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
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {row.category}
                    </Text>
                    <Text style={localStyles.categoryPct}>{pct.toFixed(0)}% of month</Text>
                  </View>
                  <Text style={styles.amount}>{formatCurrency(row.total)}</Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionHeader title="Expenses" />
      {booting ? <ActivityIndicator color={colors.primary} /> : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={booting && expenses.length === 0 ? [] : filteredExpenses}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        {...FLATLIST_PERF}
        ListEmptyComponent={
          booting ? null : (
            <Text style={styles.empty}>
              {search.trim() ? 'No expenses match your search.' : 'No expenses this month'}
            </Text>
          )
        }
      />

      <TouchableOpacity
        style={localStyles.fab}
        onPress={() => router.push('/(drawer)/expense/new' as never)}
        accessibilityLabel="Add expense"
      >
        <Text style={localStyles.fabText}>+ Add Expense</Text>
      </TouchableOpacity>
    </View>
  );
}

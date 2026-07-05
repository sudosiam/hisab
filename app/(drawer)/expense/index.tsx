import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { SearchField, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { getExpenses } from '../../../src/services/banking';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { getCurrentMonthKey } from '../../../src/utils/date';
import { spacing, radius } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
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

  const [monthKey, setMonthKey] = useState(getCurrentMonthKey());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setExpenses(await getExpenses(monthKey));
    setLoading(false);
  }, [monthKey]);

  useFocusEffect(useCallback(() => { load(); }, [load, refreshKey]));

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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search category, description, account..."
        />

        <View style={styles.row}>
          <Text style={styles.cardTitle}>{search.trim() ? 'Filtered Total' : 'Month Total'}</Text>
          <Text style={styles.amount}>{formatCurrency(monthTotal)}</Text>
        </View>

        {!loading && categoryTotals.length > 0 ? (
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
                      <Text style={styles.cardTitle}>{row.category}</Text>
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
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : filteredExpenses.length === 0 ? (
          <Text style={styles.empty}>
            {search.trim() ? 'No expenses match your search.' : 'No expenses this month'}
          </Text>
        ) : (
          filteredExpenses.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={localStyles.expenseRow}
              onPress={() => router.push(`/(drawer)/expense/${item.id}` as never)}
              activeOpacity={0.75}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{item.category}</Text>
                <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
              </View>
              <Text style={styles.cardSub}>{item.description}</Text>
              <Text style={styles.cardSub}>{item.date} · {item.account_name}</Text>
              {item.is_recurring ? (
                <Text style={localStyles.recurring}>Recurring · {item.recurrence ?? 'Monthly'}</Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={localStyles.fab}
        onPress={() => router.push('/(drawer)/expense/new' as never)}
      >
        <Text style={localStyles.fabText}>+ Add Expense</Text>
      </TouchableOpacity>
    </View>
  );
}

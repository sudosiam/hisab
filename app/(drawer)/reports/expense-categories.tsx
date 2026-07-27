import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getExpensesByCategoryReport } from '../../../src/services/reports';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareExpenseCategoriesPdf } from '../../../src/services/reportPdf';
import { roundMoney } from '../../../src/utils/money';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';

export default function ExpenseCategoriesReportScreen() {
  const router = useRouter();
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        totalWrap: { alignItems: 'center', padding: spacing.md },
        row: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.xs + 2,
          minHeight: 48,
          justifyContent: 'center',
        },
        category: { fontWeight: '600', color: colors.text, fontSize: 14 },
        count: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, isDark]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getExpensesByCategoryReport>>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    setRows(await getExpensesByCategoryReport(monthKey));
  }, [monthKey, refreshKey]);

  const { booting, error, retry } = useFocusRefresh(load, [monthKey, refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      alertRefreshFailed(e);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const total = roundMoney(rows.reduce((sum, row) => sum + row.total, 0));

  const exportPdf = useCallback(async () => shareExpenseCategoriesPdf(monthKey, rows, total), [monthKey, rows, total]);

  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error && rows.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && rows.length === 0) {
    return <ListSkeleton />;
  }

  return (
    <View style={styles.container}>
      <View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.sm }}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
      </View>
      <View style={localStyles.totalWrap}>
        <Text style={{ fontWeight: '700', color: colors.danger, marginBottom: 2 }}>Total Expenses</Text>
        <MoneyText amount={total} size="lg" color={colors.danger} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.category}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState title="No expenses" message="No expenses in this period." />
        }
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow
            style={localStyles.row}
            amount={item.total}
            amountColor={colors.danger}
            onPress={() => router.push('/(drawer)/expense' as never)}
            accessibilityLabel={`${item.category} expenses`}
          >
            <Text style={localStyles.category} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={localStyles.count}>
              {item.count} {item.count === 1 ? 'entry' : 'entries'}
            </Text>
          </ReportRow>
        )}
      />
    </View>
  );
}

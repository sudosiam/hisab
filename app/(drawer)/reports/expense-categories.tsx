import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getExpensesByCategoryReport } from '../../../src/services/reports';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareExpenseCategoriesPdf } from '../../../src/services/reportPdf';
import { roundMoney } from '../../../src/utils/money';
import { formatSqliteError } from '../../../src/db/database';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function ExpenseCategoriesReportScreen() {
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
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.xs,
        },
        category: { fontWeight: '600', color: colors.text },
        count: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, isDark]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getExpensesByCategoryReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [booting, setBooting] = useState(true);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getExpensesByCategoryReport(monthKey));
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setBooting(false);
    }
  }, [monthKey, refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const total = roundMoney(rows.reduce((sum, row) => sum + row.total, 0));

  const exportPdf = useCallback(async () => shareExpenseCategoriesPdf(monthKey, rows, total), [monthKey, rows, total]);

  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
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
        ListEmptyComponent={<Text style={styles.empty}>No expenses in this period.</Text>}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow style={localStyles.row} amount={item.total} amountColor={colors.danger}>
            <Text style={localStyles.category} numberOfLines={2}>
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

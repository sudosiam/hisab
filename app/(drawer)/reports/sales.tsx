import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getSalesReport, sumReportAmounts } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareSalesReportPdf } from '../../../src/services/reportPdf';
import { isFinancialYearPeriodKey } from '../../../src/utils/date';
import { formatSqliteError } from '../../../src/db/database';
import { radius, spacing } from '../../../src/constants/theme';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function SalesReportScreen() {
  const { refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { padding: spacing.sm },
        total: { fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm, color: colors.text },
        row: {
          backgroundColor: colors.surface,
          padding: spacing.md,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
        },
        invoice: { fontWeight: '600', color: colors.text },
        party: { fontSize: 13, color: colors.textSecondary },
        date: { fontSize: 11, color: colors.textSecondary },
        amount: { fontWeight: '700', marginTop: 4, color: colors.text },
      }),
    [colors]
  );
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getSalesReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getSalesReport(monthKey));
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    }
  }, [monthKey, refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const total = sumReportAmounts(rows);
  const emptyLabel = isFinancialYearPeriodKey(monthKey)
    ? 'No sales in this financial year'
    : 'No sales in this month';

  const exportPdf = useCallback(async () => shareSalesReportPdf(monthKey, rows, total), [monthKey, rows, total]);

  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.header}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 2 }}>Total Sales</Text>
          <MoneyText amount={total} size="lg" />
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item, index) => `${item.invoice_no}-${index}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>{emptyLabel}</Text>}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow
            style={localStyles.row}
            amount={item.total_amount}
            trailing={<StatusBadge status={item.status} />}
          >
            <Text style={localStyles.invoice} numberOfLines={1}>
              {item.invoice_no}
            </Text>
            <Text style={localStyles.party} numberOfLines={1}>
              {item.party_name}
            </Text>
            <Text style={localStyles.date}>{item.date}</Text>
          </ReportRow>
        )}
      />
    </View>
  );
}

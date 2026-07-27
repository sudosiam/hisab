import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getPurchaseReport, sumReportAmounts } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { ErrorState, EmptyState, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { sharePurchaseReportPdf } from '../../../src/services/reportPdf';
import { formatDisplayDate, isFinancialYearPeriodKey } from '../../../src/utils/date';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';

export default function PurchaseReportScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
        totalWrap: { alignItems: 'center', marginBottom: spacing.sm },
        row: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.xs + 2,
          minHeight: 52,
          justifyContent: 'center',
        },
        invoice: { fontWeight: '600', color: colors.text, fontSize: 14 },
        party: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
        date: { fontSize: 11, color: colors.textMuted },
      }),
    [colors, isDark]
  );
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPurchaseReport>>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    setRows(await getPurchaseReport(monthKey));
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

  const total = sumReportAmounts(rows);
  const emptyLabel = isFinancialYearPeriodKey(monthKey)
    ? 'No purchases in this financial year'
    : 'No purchases in this month';

  const exportPdf = useCallback(async () => sharePurchaseReportPdf(monthKey, rows, total), [monthKey, rows, total]);

  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error && rows.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && rows.length === 0) {
    return <ListSkeleton />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.header}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        <View style={localStyles.totalWrap}>
          <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 2 }}>Total Purchases</Text>
          <MoneyText amount={total} size="lg" />
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No purchases"
            message={emptyLabel}
            actionLabel="New Purchase"
            onAction={() => router.push('/(drawer)/purchases/new' as never)}
          />
        }
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow
            style={localStyles.row}
            amount={item.total_amount}
            trailing={<StatusBadge status={item.status} />}
            onPress={() => router.push(`/(drawer)/purchases/${item.id}`)}
            accessibilityLabel={`Purchase ${item.invoice_no}`}
          >
            <Text style={localStyles.invoice} numberOfLines={1}>
              {item.invoice_no}
            </Text>
            <Text style={localStyles.party} numberOfLines={1}>
              {item.supplier_name}
            </Text>
            <Text style={localStyles.date}>{formatDisplayDate(item.date)}</Text>
          </ReportRow>
        )}
      />
    </View>
  );
}

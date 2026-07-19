import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getGstCustomersByState, type GstStateWiseRow } from '../../../src/services/gstReports';
import { ReportRow } from '../../../src/components/ReportRow';
import { formatCurrency } from '../../../src/utils/format';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareGstStateWisePdf } from '../../../src/services/reportPdf';
import { formatSqliteError } from '../../../src/db/database';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function GstStateWiseScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [rows, setRows] = useState<GstStateWiseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [booting, setBooting] = useState(true);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.xs,
        },
        title: { fontWeight: '600', color: colors.text },
        meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getGstCustomersByState(monthKey));
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setBooting(false);
    }
  }, [monthKey, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const exportPdf = useCallback(async () => shareGstStateWisePdf(monthKey, rows), [monthKey, rows]);
  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error) return <ErrorState message={error} onRetry={load} />;
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
      <FlatList
        data={rows}
        keyExtractor={(item) => item.state_code}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No sales in this period.</Text>}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow style={localStyles.row} amount={item.total_amount}>
            <Text style={localStyles.title}>
              {item.state_label}
              {item.state_code !== '—' ? ` (${item.state_code})` : ''}
            </Text>
            <Text style={localStyles.meta}>
              {item.invoice_count} invoice{item.invoice_count === 1 ? '' : 's'} · Taxable{' '}
              {formatCurrency(item.taxable_amount)} · Tax {formatCurrency(item.tax_amount)}
            </Text>
          </ReportRow>
        )}
      />
    </View>
  );
}

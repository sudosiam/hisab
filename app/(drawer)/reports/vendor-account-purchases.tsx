import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { MonthPicker } from '../../../src/components/MonthPicker';
import {
  getPurchasesByVendorAccount,
  type VendorAccountPurchaseRow,
} from '../../../src/services/reports';
import { ReportRow } from '../../../src/components/ReportRow';
import { formatCurrency } from '../../../src/utils/format';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareVendorAccountPurchasesPdf } from '../../../src/services/reportPdf';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';

export default function VendorAccountPurchasesScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [rows, setRows] = useState<VendorAccountPurchaseRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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
    setRows(await getPurchasesByVendorAccount(monthKey));
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

  const exportPdf = useCallback(
    async () => shareVendorAccountPurchasesPdf(monthKey, rows),
    [monthKey, rows]
  );
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
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.party_id ?? 'x'}-${item.vendor_name}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState title="No purchases" message="No purchases in this period." />
        }
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow style={localStyles.row} amount={item.total_amount}>
            <Text style={localStyles.title} numberOfLines={1}>
              {item.vendor_name}
            </Text>
            <Text style={localStyles.meta}>
              {item.bill_count} bill{item.bill_count === 1 ? '' : 's'} · Due{' '}
              {formatCurrency(item.due_amount)}
            </Text>
            {item.accounts.length > 0 ? (
              <Text style={localStyles.meta} numberOfLines={2}>
                Paid via{' '}
                {item.accounts
                  .map((a) => `${a.account_name} ${formatCurrency(a.paid)}`)
                  .join(' · ')}
              </Text>
            ) : (
              <Text style={localStyles.meta}>No payments recorded</Text>
            )}
          </ReportRow>
        )}
      />
    </View>
  );
}

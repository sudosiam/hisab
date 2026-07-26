import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getGstOutwardSupplies, type GstOutwardLine } from '../../../src/services/gstReports';
import { ReportRow } from '../../../src/components/ReportRow';
import { formatCurrency } from '../../../src/utils/format';
import { formatDisplayDate } from '../../../src/utils/date';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useGstEnabled } from '../../../src/context/GstContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareGstOutwardPdf } from '../../../src/services/reportPdf';
import { formatSqliteError } from '../../../src/db/database';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function GstOutwardScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const gstEnabled = useGstEnabled();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [rows, setRows] = useState<GstOutwardLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [booting, setBooting] = useState(true);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.xs + 2,
          minHeight: 52,
          justifyContent: 'center',
        },
        title: { fontWeight: '600', color: colors.text, fontSize: 14 },
        meta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getGstOutwardSupplies(monthKey));
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

  const exportPdf = useCallback(async () => shareGstOutwardPdf(monthKey, rows), [monthKey, rows]);
  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (!gstEnabled) return <Redirect href="/(drawer)/reports" />;
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
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No outward supplies in this period.</Text>}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow
            style={localStyles.row}
            amount={item.total_amount}
            onPress={() => router.push(`/(drawer)/sales/${item.id}`)}
            accessibilityLabel={`Sale ${item.invoice_no}`}
          >
            <Text style={localStyles.title} numberOfLines={1}>
              {item.invoice_no} · {item.party_name}
            </Text>
            <Text style={localStyles.meta}>
              {formatDisplayDate(item.date)} · {item.supply_type} · {item.invoice_type}
            </Text>
            <Text style={localStyles.meta}>
              Taxable {formatCurrency(item.taxable_amount)}
              {item.igst_amount > 0
                ? ` · IGST ${formatCurrency(item.igst_amount)}`
                : ` · CGST ${formatCurrency(item.cgst_amount)} · SGST ${formatCurrency(item.sgst_amount)}`}
            </Text>
          </ReportRow>
        )}
      />
    </View>
  );
}

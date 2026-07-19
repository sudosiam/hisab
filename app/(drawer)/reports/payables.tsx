import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getPayablesReport } from '../../../src/services/reports';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { sharePayablesPdf } from '../../../src/services/reportPdf';
import { roundMoney } from '../../../src/utils/money';
import { formatDisplayDate } from '../../../src/utils/date';
import { formatSqliteError } from '../../../src/db/database';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function PayablesReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
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
        invoice: { fontWeight: '600', color: colors.text },
        party: { fontSize: 13, color: colors.textSecondary },
        date: { fontSize: 11, color: colors.textSecondary },
      }),
    [colors, isDark]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPayablesReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [booting, setBooting] = useState(true);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getPayablesReport());
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setBooting(false);
    }
  }, [refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const total = roundMoney(rows.reduce((s, r) => s + r.due, 0));

  const exportPdf = useCallback(async () => sharePayablesPdf(rows, total), [rows, total]);

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
      <View style={localStyles.totalWrap}>
        <Text style={{ fontWeight: '700', color: colors.warning, marginBottom: 2 }}>Total Payable</Text>
        <MoneyText amount={total} size="lg" color={colors.warning} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item, index) => `${item.invoice_no}-${index}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No outstanding supplier dues</Text>}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow style={localStyles.row} amount={item.due} amountColor={colors.warning}>
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

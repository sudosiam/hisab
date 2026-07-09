import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getReceivablesReport } from '../../../src/services/reports';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareReceivablesPdf } from '../../../src/services/reportPdf';
import { roundMoney } from '../../../src/utils/money';
import { formatSqliteError } from '../../../src/db/database';
import { radius, spacing } from '../../../src/constants/theme';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function ReceivablesReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        totalWrap: { alignItems: 'center', padding: spacing.md },
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
      }),
    [colors]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getReceivablesReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getReceivablesReport());
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    }
  }, [refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const total = roundMoney(rows.reduce((s, r) => s + r.due, 0));

  const exportPdf = useCallback(async () => shareReceivablesPdf(rows, total), [rows, total]);

  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.totalWrap}>
        <Text style={{ fontWeight: '700', color: colors.danger, marginBottom: 2 }}>Total Receivable</Text>
        <MoneyText amount={total} size="lg" color={colors.danger} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item, index) => `${item.invoice_no}-${index}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No outstanding customer dues</Text>}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow style={localStyles.row} amount={item.due} amountColor={colors.danger}>
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

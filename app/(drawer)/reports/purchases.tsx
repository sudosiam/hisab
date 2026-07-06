import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getPurchaseReport, sumReportAmounts } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { formatCurrency } from '../../../src/utils/format';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { radius, spacing } from '../../../src/constants/theme';

export default function PurchaseReportScreen() {
  const { refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { padding: spacing.sm },
        total: { fontWeight: '700', textAlign: 'center', color: colors.text },
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: colors.surface,
          padding: spacing.md,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
        },
        invoice: { fontWeight: '600', color: colors.text },
        party: { fontSize: 13, color: colors.textSecondary },
        amount: { fontWeight: '700', marginTop: 4, color: colors.text },
      }),
    [colors]
  );
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPurchaseReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getPurchaseReport(monthKey));
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

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.header}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        <Text style={localStyles.total}>Total Purchases: {formatCurrency(total)}</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.invoice_no}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No purchases in this month</Text>}
        renderItem={({ item }) => (
          <View style={localStyles.row}>
            <View>
              <Text style={localStyles.invoice}>{item.invoice_no}</Text>
              <Text style={localStyles.party}>{item.supplier_name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <StatusBadge status={item.status} />
              <Text style={localStyles.amount}>{formatCurrency(item.total_amount)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

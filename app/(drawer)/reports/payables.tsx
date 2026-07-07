import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getPayablesReport } from '../../../src/services/reports';
import { formatCurrency } from '../../../src/utils/format';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { roundMoney } from '../../../src/utils/money';
import { formatSqliteError } from '../../../src/db/database';
import { radius, spacing } from '../../../src/constants/theme';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function PayablesReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        total: { fontWeight: '700', textAlign: 'center', padding: spacing.md, color: colors.warning },
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
        due: { fontWeight: '700', color: colors.warning },
      }),
    [colors]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPayablesReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getPayablesReport());
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

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <View style={styles.container}>
      <Text style={localStyles.total}>Total Payable: {formatCurrency(total)}</Text>
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
          <View style={localStyles.row}>
            <View>
              <Text style={localStyles.invoice}>{item.invoice_no}</Text>
              <Text style={localStyles.party}>{item.supplier_name}</Text>
            </View>
            <Text style={localStyles.due}>{formatCurrency(item.due)}</Text>
          </View>
        )}
      />
    </View>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getInventoryReport } from '../../../src/services/reports';
import { formatCurrency } from '../../../src/utils/format';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareInventoryReportPdf } from '../../../src/services/reportPdf';
import { roundMoney } from '../../../src/utils/money';
import { formatSqliteError } from '../../../src/db/database';
import { radius, spacing } from '../../../src/constants/theme';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';

export default function InventoryReportScreen() {
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
        name: { fontWeight: '600', color: colors.text },
        meta: { fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
      }),
    [colors]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getInventoryReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setRows(await getInventoryReport());
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

  const totalValue = roundMoney(rows.reduce((s, r) => s + r.value, 0));

  const exportPdf = useCallback(async () => shareInventoryReportPdf(rows, totalValue), [rows, totalValue]);

  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.totalWrap}>
        <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 2 }}>Total Inventory Value</Text>
        <MoneyText amount={totalValue} size="lg" />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No products in inventory</Text>}
        {...FLATLIST_PERF}
        renderItem={({ item }) => {
          const sell = item.sell_price > 0 ? item.sell_price : item.avg_cost * 1.2;
          return (
            <ReportRow style={localStyles.row} amount={item.value}>
              <Text style={localStyles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={localStyles.meta} numberOfLines={2}>
                Qty {item.current_qty}
              </Text>
              <Text style={localStyles.meta} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                Cost {formatCurrency(item.avg_cost)} · Sell {formatCurrency(sell)}
              </Text>
            </ReportRow>
          );
        }}
      />
    </View>
  );
}

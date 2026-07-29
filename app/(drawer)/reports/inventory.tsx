import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { getInventoryReport } from '../../../src/services/reports';
import { formatCurrency } from '../../../src/utils/format';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { ErrorState, EmptyState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareInventoryReportPdf } from '../../../src/services/reportPdf';
import { roundMoney } from '../../../src/utils/money';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';

export default function InventoryReportScreen() {
  const router = useRouter();
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
          paddingVertical: spacing.sm,
          marginBottom: spacing.xs + 2,
          minHeight: 52,
          justifyContent: 'center',
        },
        name: { fontWeight: '600', color: colors.text, fontSize: 14 },
        meta: { fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
      }),
    [colors, isDark]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getInventoryReport>>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    setRows(await getInventoryReport());
  }, [refreshKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey]);

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

  const totalValue = roundMoney(rows.reduce((s, r) => s + r.value, 0));

  const exportPdf = useCallback(async () => shareInventoryReportPdf(rows, totalValue), [rows, totalValue]);

  useReportPdfHeader({ disabled: !!error, onExport: exportPdf });

  if (error && rows.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && rows.length === 0) {
    return <ListSkeleton />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.totalWrap}>
        <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 2 }}>Total Inventory Value</Text>
        <MoneyText amount={totalValue} size="lg" />
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
            title="No products"
            message="No products in inventory."
            actionLabel="Add Product"
            onAction={() => router.push('/(drawer)/inventory/new' as never)}
          />
        }
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        renderItem={({ item }) => {
          const sellLabel =
            item.sell_price > 0 ? formatCurrency(item.sell_price) : '—';
          return (
            <ReportRow
              style={localStyles.row}
              amount={item.value}
              onPress={() => router.push(`/(drawer)/inventory/${item.id}`)}
              accessibilityLabel={`Product ${item.name}`}
            >
              <Text style={localStyles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={localStyles.meta} numberOfLines={1}>
                Qty {item.current_qty}
              </Text>
              <Text style={localStyles.meta} numberOfLines={2}>
                Cost {formatCurrency(item.avg_cost)}
              </Text>
              <Text style={localStyles.meta} numberOfLines={2}>
                Sell {sellLabel}
              </Text>
            </ReportRow>
          );
        }}
      />
    </View>
  );
}

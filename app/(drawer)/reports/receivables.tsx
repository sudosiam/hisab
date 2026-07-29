import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { getReceivablesReport, summarizeAging } from '../../../src/services/reports';
import { ReportRow } from '../../../src/components/ReportRow';
import { MoneyText } from '../../../src/components/MoneyText';
import { DonutChart } from '../../../src/components/DonutChart';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { ErrorState, EmptyState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareReceivablesPdf } from '../../../src/services/reportPdf';
import { roundMoney } from '../../../src/utils/money';
import { formatDisplayDate, todayISO } from '../../../src/utils/date';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';

export default function ReceivablesReportScreen() {
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
        invoice: { fontWeight: '600', color: colors.text, fontSize: 14 },
        typeMeta: { fontSize: 10, fontWeight: '700', color: colors.primary, marginTop: 2 },
        typeMetaBos: { color: colors.warning },
        party: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
        date: { fontSize: 11, color: colors.textMuted },
      }),
    [colors, isDark]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getReceivablesReport>>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    setRows(await getReceivablesReport());
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

  const total = roundMoney(rows.reduce((s, r) => s + r.due, 0));
  const aging = useMemo(() => summarizeAging(rows, todayISO()), [rows]);

  const exportPdf = useCallback(async () => shareReceivablesPdf(rows, total), [rows, total]);

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
        <Text style={{ fontWeight: '700', color: colors.danger, marginBottom: 2 }}>Total Receivable</Text>
        <MoneyText amount={total} size="lg" color={colors.danger} />
      </View>
      {rows.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
          <DonutChart
            slices={aging.map((b) => ({
              key: b.key,
              label: b.label,
              value: b.total,
            }))}
            emptyLabel="No aging data"
          />
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            title="All caught up"
            message="No outstanding customer dues."
          />
        }
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        renderItem={({ item }) => (
          <ReportRow
            style={localStyles.row}
            amount={item.due}
            amountColor={colors.danger}
            onPress={() => router.push(`/(drawer)/sales/${item.id}`)}
            accessibilityLabel={`Receivable ${item.invoice_no}`}
          >
            <Text style={localStyles.invoice} numberOfLines={1}>
              {item.invoice_no}
            </Text>
            <Text
              style={[
                localStyles.typeMeta,
                item.invoice_type === 'bos' && localStyles.typeMetaBos,
              ]}
            >
              {item.invoice_type === 'bos' ? 'BOS' : 'Invoice'}
            </Text>
            <Text style={localStyles.party} numberOfLines={1}>
              {item.party_name}
            </Text>
            <Text style={localStyles.date}>{formatDisplayDate(item.date)}</Text>
          </ReportRow>
        )}
      />
    </View>
  );
}

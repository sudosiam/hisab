import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import {
  getProfitLossReport,
  getExpensesByCategoryReport,
  getProfitLossComparisonReport,
} from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { formatCurrency, formatSignedCurrency } from '../../../src/utils/format';
import { MoneyText, moneyRowStyles } from '../../../src/components/MoneyText';
import { ErrorState, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareProfitLossPdf } from '../../../src/services/reportPdf';
import { radius, spacing } from '../../../src/constants/theme';

export default function ProfitLossReportScreen() {
  const { refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        line: { ...moneyRowStyles.row, paddingVertical: spacing.sm },
        lineLabel: { fontSize: 14, color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        lineValue: { maxWidth: '50%' },
        bold: { fontWeight: '700' },
        highlight: { color: colors.text, fontSize: 18 },
        neg: { color: colors.danger },
        compareHeader: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
        compareRow: {
          ...moneyRowStyles.row,
          paddingVertical: 6,
        },
        compareLabel: { fontSize: 13, color: colors.textSecondary, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        compareValue: { maxWidth: '50%' },
        compareUp: { color: colors.success },
        compareDown: { color: colors.danger },
      }),
    [colors]
  );
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [data, setData] = useState<Awaited<ReturnType<typeof getProfitLossReport>> | null>(null);
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof getProfitLossComparisonReport>> | null>(null);
  const [expenseRows, setExpenseRows] = useState<Awaited<ReturnType<typeof getExpensesByCategoryReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    setPeriodLoading(true);
    try {
      const [pl, categories, compare] = await Promise.all([
        getProfitLossReport(monthKey),
        getExpensesByCategoryReport(monthKey),
        getProfitLossComparisonReport(monthKey),
      ]);
      setData(pl);
      setExpenseRows(categories);
      setComparison(compare);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setPeriodLoading(false);
    }
  }, [monthKey, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const exportPdf = useCallback(async () => {
    if (!data) return { success: false, message: 'Report not loaded yet.' };
    return shareProfitLossPdf(monthKey, data, comparison, expenseRows);
  }, [monthKey, data, comparison, expenseRows]);

  useReportPdfHeader({ disabled: !data || !!error, onExport: exportPdf });

  if (error && !data) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load().finally(() => setRefreshing(false));
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
      {periodLoading ? (
        <ActivityIndicator style={{ marginBottom: spacing.sm }} color={colors.primary} />
      ) : null}
      <View style={[localStyles.card, periodLoading && { opacity: 0.5 }]}>
        <Line localStyles={localStyles} label="Revenue (Sales)" value={data.revenue} />
        <Line localStyles={localStyles} label="Cost of Goods Sold" value={-data.cogs} negative />
        <Line localStyles={localStyles} label="Gross Profit" value={data.grossProfit} bold />
        <Line localStyles={localStyles} label="Other Income" value={data.otherIncome} />
        <Line localStyles={localStyles} label="Operating Expenses" value={-data.expenses} negative />
        <Line localStyles={localStyles} label="Net Profit" value={data.netProfit} bold highlight />
      </View>

      {comparison ? (
        <>
          <SectionHeader title={`vs ${comparison.previousPeriodLabel}`} />
          <View style={localStyles.card}>
            <Text style={localStyles.compareHeader} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
              Previous net profit: {formatCurrency(comparison.previous.netProfit)}
            </Text>
            <CompareLine localStyles={localStyles} label="Revenue change" value={comparison.change.revenue} />
            <CompareLine localStyles={localStyles} label="Gross profit change" value={comparison.change.grossProfit} />
            <CompareLine localStyles={localStyles} label="Expense change" value={comparison.change.expenses} expense />
            <CompareLine localStyles={localStyles} label="Net profit change" value={comparison.change.netProfit} bold />
          </View>
        </>
      ) : null}

      {expenseRows.length > 0 ? (
        <>
          <SectionHeader title="Expense Breakdown" />
          <View style={localStyles.card}>
            {expenseRows.map((row) => (
              <Line
                key={row.category}
                localStyles={localStyles}
                label={`${row.category} (${row.count})`}
                value={-row.total}
                negative
              />
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function CompareLine({
  label,
  value,
  bold,
  expense,
  localStyles,
}: {
  label: string;
  value: number;
  bold?: boolean;
  expense?: boolean;
  localStyles: {
    compareRow: ViewStyle;
    compareLabel: TextStyle;
    compareValue: TextStyle;
    compareUp: TextStyle;
    compareDown: TextStyle;
    bold: TextStyle;
  };
}) {
  const { colors } = useTheme();
  const amountColor =
    value === 0
      ? undefined
      : expense
        ? value < 0
          ? colors.success
          : colors.danger
        : value > 0
          ? colors.success
          : colors.danger;

  return (
    <View style={localStyles.compareRow}>
      <Text style={[localStyles.compareLabel, bold && localStyles.bold]} numberOfLines={2}>
        {label}
      </Text>
      <MoneyText
        amount={0}
        text={formatSignedCurrency(value)}
        size="sm"
        color={amountColor}
        style={[localStyles.compareValue, bold && localStyles.bold]}
      />
    </View>
  );
}

function Line({
  label,
  value,
  bold,
  highlight,
  negative,
  localStyles,
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: boolean;
  negative?: boolean;
  localStyles: {
    line: ViewStyle;
    lineLabel: TextStyle;
    lineValue: TextStyle;
    bold: TextStyle;
    highlight: TextStyle;
    neg: TextStyle;
  };
}) {
  return (
    <View style={localStyles.line}>
      <Text style={[localStyles.lineLabel, bold && localStyles.bold]} numberOfLines={2}>
        {label}
      </Text>
      <MoneyText
        amount={Math.abs(value)}
        size={highlight ? 'lg' : 'md'}
        style={[localStyles.lineValue, negative && localStyles.neg]}
      />
    </View>
  );
}

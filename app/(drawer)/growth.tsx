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
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useFinancialYear } from '../../src/context/FinancialYearContext';
import { useDatabase } from '../../src/context/DatabaseContext';
import { ErrorState, SectionHeader, useScreenStyles } from '../../src/components/ui';
import { GrowthChart } from '../../src/components/GrowthChart';
import { getGrowthReport } from '../../src/services/growth';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../src/utils/format';
import { useTheme } from '../../src/context/ThemeContext';
import { spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { GrowthReport } from '../../src/services/growth';

export default function GrowthScreen() {
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const { refreshKey } = useDatabase();
  const { fyRevision } = useFinancialYear();
  const [data, setData] = useState<GrowthReport | null>(null);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...cardSurface(colors, isDark),
          padding: spacing.lg,
          marginBottom: spacing.md,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textMuted, textTransform: 'uppercase' },
        heroValue: { ...typography.display, color: colors.primary, marginTop: spacing.sm },
        heroSub: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
        card: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
        rowLabel: { fontSize: 14, color: colors.text },
        rowValue: { fontSize: 14, color: colors.text, fontWeight: '500' },
        pos: { color: colors.success, fontWeight: '700' },
        neg: { color: colors.danger, fontWeight: '700' },
        bold: { fontWeight: '700' },
        chartCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        monthCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        monthHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.sm,
        },
        monthTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
        monthProfit: { fontSize: 16, fontWeight: '700', color: colors.primary },
        monthProfitNeg: { color: colors.danger },
        monthProfitMuted: { color: colors.textMuted },
        detailRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 4,
        },
        detailLabel: { fontSize: 13, color: colors.textSecondary },
        detailValue: { fontSize: 13, color: colors.text, fontWeight: '500' },
        cumulative: {
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
        },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    setData(await getGrowthReport());
  }, []);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, fyRevision]);
  const [refreshing, setRefreshing] = useState(false);

  const rowStyles = useMemo(
    () => ({
      row: localStyles.row as ViewStyle,
      rowLabel: localStyles.rowLabel as TextStyle,
      rowValue: localStyles.rowValue as TextStyle,
      bold: localStyles.bold as TextStyle,
      pos: localStyles.pos as TextStyle,
      neg: localStyles.neg as TextStyle,
    }),
    [localStyles]
  );

  const barData = useMemo(
    () => (data ? data.months.map((m) => ({ label: m.shortLabel, value: m.netProfit })) : []),
    [data]
  );
  const lineData = useMemo(
    () =>
      data ? data.months.map((m) => ({ label: m.shortLabel, value: m.cumulativeSurplus })) : [],
    [data]
  );

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { snapshot, months } = data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load()
              .catch(() => {})
              .finally(() => setRefreshing(false));
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={localStyles.hero}>
        <Text style={localStyles.heroLabel}>Net worth</Text>
        <Text style={localStyles.heroValue}>{formatCurrency(snapshot.netWorth)}</Text>
        <Text style={localStyles.heroSub}>
          Assets {formatCurrency(snapshot.totalAssets)} − Liabilities{' '}
          {formatCurrency(snapshot.liabilities)}
        </Text>
      </View>

      <View style={localStyles.card}>
        <Text style={[localStyles.rowLabel, localStyles.bold, { marginBottom: spacing.xs }]}>
          What you own
        </Text>
        <MetricRow localStyles={rowStyles} label="Cash & bank" value={snapshot.cashAndBank} />
        <MetricRow localStyles={rowStyles} label="Inventory" value={snapshot.inventory} />
        <MetricRow localStyles={rowStyles} label="Receivables" value={snapshot.receivables} />
        <MetricRow localStyles={rowStyles} label="Fixed assets" value={snapshot.fixedAssets} />
        <MetricRow localStyles={rowStyles} label="Total assets" value={snapshot.totalAssets} bold />
        <MetricRow localStyles={rowStyles} label="Liabilities (payables)" value={snapshot.liabilities} />
        <View style={{ height: spacing.sm }} />
        <MetricRow localStyles={rowStyles} label="You invested" value={snapshot.ownerInvestment} />
        <MetricRow
          localStyles={rowStyles}
          label="Ahead / behind"
          value={snapshot.aheadBehind}
          signed
        />
        <MetricRow
          localStyles={rowStyles}
          label="Return on money in"
          text={
            snapshot.ownerInvestment > 0
              ? formatPercent(snapshot.returnOnInvestment)
              : '—'
          }
          valueStyle={
            snapshot.returnOnInvestment >= 0 ? localStyles.pos : localStyles.neg
          }
        />
      </View>

      <SectionHeader title="Equity over time" />

      <View style={localStyles.chartCard}>
        <Text style={[localStyles.rowLabel, localStyles.bold, { marginBottom: spacing.sm }]}>
          Monthly net profit
        </Text>
        <GrowthChart data={barData} variant="bar" />
      </View>

      <View style={localStyles.chartCard}>
        <Text style={[localStyles.rowLabel, localStyles.bold, { marginBottom: spacing.sm }]}>
          Cumulative surplus (trend)
        </Text>
        <GrowthChart data={lineData} variant="line" />
      </View>

      <SectionHeader title="Month by month" />
      {months.map((month) => {
        const profitStyle = month.hasActivity
          ? month.netProfit >= 0
            ? localStyles.monthProfit
            : [localStyles.monthProfit, localStyles.monthProfitNeg]
          : [localStyles.monthProfit, localStyles.monthProfitMuted];

        const showValue = (value: number) =>
          month.hasActivity && value > 0 ? formatCurrency(value) : '—';

        return (
          <View key={month.monthKey} style={localStyles.monthCard}>
            <View style={localStyles.monthHeader}>
              <Text style={localStyles.monthTitle}>{month.label}</Text>
              <Text style={profitStyle}>{formatCurrency(month.netProfit)}</Text>
            </View>
            <View style={localStyles.detailRow}>
              <Text style={localStyles.detailLabel}>Revenue</Text>
              <Text style={localStyles.detailValue}>{showValue(month.revenue)}</Text>
            </View>
            <View style={localStyles.detailRow}>
              <Text style={localStyles.detailLabel}>COGS</Text>
              <Text style={localStyles.detailValue}>{showValue(month.cogs)}</Text>
            </View>
            <View style={localStyles.detailRow}>
              <Text style={localStyles.detailLabel}>Op. expenses</Text>
              <Text style={localStyles.detailValue}>{showValue(month.operatingExpenses)}</Text>
            </View>
            <View style={localStyles.detailRow}>
              <Text style={localStyles.detailLabel}>Other income</Text>
              <Text style={localStyles.detailValue}>{showValue(month.otherIncome)}</Text>
            </View>
            <View style={localStyles.cumulative}>
              <View style={localStyles.detailRow}>
                <Text style={localStyles.detailLabel}>Cumulative</Text>
                <Text style={[localStyles.detailValue, localStyles.bold]}>
                  {formatCurrency(month.cumulativeSurplus)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function MetricRow({
  label,
  value,
  signed,
  text,
  valueStyle,
  bold,
  localStyles,
}: {
  label: string;
  value?: number;
  signed?: boolean;
  text?: string;
  valueStyle?: TextStyle;
  bold?: boolean;
  localStyles: {
    row: ViewStyle;
    rowLabel: TextStyle;
    rowValue: TextStyle;
    bold: TextStyle;
    pos: TextStyle;
    neg: TextStyle;
  };
}) {
  let display = text ?? '';
  if (text === undefined && value !== undefined) {
    display = signed ? formatSignedCurrency(value) : formatCurrency(value);
  }

  const style =
    valueStyle ??
    (signed && value !== undefined
      ? value >= 0
        ? localStyles.pos
        : localStyles.neg
      : undefined);

  return (
    <View style={localStyles.row}>
      <Text style={[localStyles.rowLabel, bold && localStyles.bold]}>{label}</Text>
      <Text style={[localStyles.rowValue, bold && localStyles.bold, style]}>{display}</Text>
    </View>
  );
}

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
import { MoneyText, moneyRowStyles } from '../../src/components/MoneyText';
import { useTheme } from '../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../src/hooks/useReportPdfHeader';
import { shareGrowthReportPdf } from '../../src/services/reportPdf';
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
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginBottom: spacing.md,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textSecondary, textTransform: 'uppercase' },
        heroValue: { marginTop: spacing.sm, textAlign: 'center' },
        heroSub: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
        card: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        row: { ...moneyRowStyles.row, paddingVertical: spacing.sm },
        rowLabel: { fontSize: 14, color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        rowValue: { maxWidth: '52%' },
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
          ...moneyRowStyles.row,
          alignItems: 'center',
          marginBottom: spacing.sm,
        },
        monthTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        monthProfit: { maxWidth: '48%' },
        monthProfitNeg: { color: colors.danger },
        monthProfitMuted: { color: colors.textMuted },
        detailRow: {
          ...moneyRowStyles.row,
          paddingVertical: 4,
        },
        detailLabel: { fontSize: 13, color: colors.textSecondary, flex: 1, minWidth: 0 },
        detailValue: { maxWidth: '52%' },
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

  const exportPdf = useCallback(async () => {
    if (!data) return { success: false, message: 'Report not loaded yet.' };
    return shareGrowthReportPdf(data);
  }, [data]);

  useReportPdfHeader({ disabled: !data || !!error, onExport: exportPdf });

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
        <MoneyText amount={snapshot.netWorth} size="hero" style={localStyles.heroValue} />
        <Text style={localStyles.heroSub} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
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
        const showValue = (value: number) =>
          month.hasActivity && value > 0 ? formatCurrency(value) : '—';

        return (
          <View key={month.monthKey} style={localStyles.monthCard}>
            <View style={localStyles.monthHeader}>
              <Text style={localStyles.monthTitle} numberOfLines={1}>
                {month.label}
              </Text>
              <MoneyText
                amount={month.netProfit}
                size="md"
                color={
                  month.hasActivity
                    ? month.netProfit >= 0
                      ? colors.text
                      : colors.danger
                    : colors.textMuted
                }
                style={localStyles.monthProfit}
              />
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
  const { colors } = useTheme();
  let display = text ?? '';
  if (text === undefined && value !== undefined) {
    display = signed ? formatSignedCurrency(value) : formatCurrency(value);
  }

  const color =
    signed && value !== undefined
      ? value >= 0
        ? colors.success
        : colors.danger
      : valueStyle && 'color' in valueStyle
        ? (valueStyle.color as string)
        : undefined;

  return (
    <View style={localStyles.row}>
      <Text style={[localStyles.rowLabel, bold && localStyles.bold]} numberOfLines={2}>
        {label}
      </Text>
      <MoneyText
        amount={value ?? 0}
        text={display || undefined}
        size={bold ? 'md' : 'sm'}
        color={color}
        style={[localStyles.rowValue, bold && localStyles.bold]}
      />
    </View>
  );
}

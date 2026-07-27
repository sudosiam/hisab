import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useFinancialYear } from '../../src/context/FinancialYearContext';
import { useDatabase } from '../../src/context/DatabaseContext';
import { ErrorState, SectionHeader, SummaryHero, useScreenStyles } from '../../src/components/ui';
import { GrowthChart } from '../../src/components/GrowthChart';
import { getGrowthReport } from '../../src/services/growth';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../src/utils/format';
import { MoneyText, moneyRowStyles } from '../../src/components/MoneyText';
import { DetailSkeleton } from '../../src/components/Skeleton';
import { useTheme } from '../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../src/hooks/useReportPdfHeader';
import { shareGrowthReportPdf } from '../../src/services/reportPdf';
import { spacing, typography } from '../../src/constants/theme';
import { alertRefreshFailed } from '../../src/utils/uiFeedback';
import type { GrowthReport } from '../../src/services/growth';

export default function GrowthScreen() {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const { refreshKey } = useDatabase();
  const { fyRevision } = useFinancialYear();
  const [data, setData] = useState<GrowthReport | null>(null);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginBottom: spacing.md },
        blockTitle: {
          ...typography.bodyMedium,
          fontWeight: '700',
          color: colors.text,
          marginBottom: spacing.xs,
        },
        row: { ...moneyRowStyles.row, paddingVertical: spacing.sm },
        rowLabel: { fontSize: 14, color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        rowValue: { maxWidth: '62%', flexShrink: 1, minWidth: 88, width: '100%', textAlign: 'right' },
        pos: { color: colors.success, fontWeight: '700' },
        neg: { color: colors.danger, fontWeight: '700' },
        bold: { fontWeight: '700' },
        hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderLight },
        chartBlock: { marginBottom: spacing.lg },
        chartTitle: {
          ...typography.bodyMedium,
          fontWeight: '600',
          color: colors.text,
          marginBottom: spacing.sm,
        },
        monthBlock: {
          paddingVertical: spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderLight,
        },
        monthHeader: {
          ...moneyRowStyles.row,
          alignItems: 'center',
          marginBottom: spacing.xs,
        },
        monthTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        monthProfit: { maxWidth: '58%', flexShrink: 1, minWidth: 80, width: '100%', textAlign: 'right' },
        detailRow: {
          ...moneyRowStyles.row,
          paddingVertical: 4,
        },
        detailLabel: { fontSize: 13, color: colors.textSecondary, flex: 1, minWidth: 0 },
        detailValue: {
          maxWidth: '62%',
          flexShrink: 1,
          minWidth: 80,
          width: '100%',
          textAlign: 'right',
          color: colors.text,
          fontVariant: ['tabular-nums'],
        },
        cumulative: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.borderLight,
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
        },
      }),
    [colors]
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
    return <DetailSkeleton />;
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
              .catch((e) => alertRefreshFailed(e))
              .finally(() => setRefreshing(false));
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <SummaryHero
        label="Net worth"
        amount={snapshot.netWorth}
        hint={`Assets ${formatCurrency(snapshot.totalAssets)} − Liabilities ${formatCurrency(snapshot.liabilities)}`}
      />

      <SectionHeader title="What you own" />
      <View style={localStyles.block}>
        <MetricRow localStyles={rowStyles} label="Cash & bank" value={snapshot.cashAndBank} />
        <View style={localStyles.hairline} />
        <MetricRow localStyles={rowStyles} label="Inventory" value={snapshot.inventory} />
        <View style={localStyles.hairline} />
        <MetricRow localStyles={rowStyles} label="Receivables" value={snapshot.receivables} />
        <View style={localStyles.hairline} />
        <MetricRow localStyles={rowStyles} label="Fixed assets" value={snapshot.fixedAssets} />
        <View style={localStyles.hairline} />
        <MetricRow localStyles={rowStyles} label="Total assets" value={snapshot.totalAssets} bold />
        <View style={localStyles.hairline} />
        <MetricRow localStyles={rowStyles} label="Liabilities (payables)" value={snapshot.liabilities} />
        <View style={localStyles.hairline} />
        <MetricRow localStyles={rowStyles} label="You invested" value={snapshot.ownerInvestment} />
        <View style={localStyles.hairline} />
        <MetricRow
          localStyles={rowStyles}
          label="Ahead / behind"
          value={snapshot.aheadBehind}
          signed
        />
        <View style={localStyles.hairline} />
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

      <View style={localStyles.chartBlock}>
        <Text style={localStyles.chartTitle}>Monthly net profit</Text>
        <GrowthChart data={barData} variant="bar" />
      </View>

      <View style={localStyles.chartBlock}>
        <Text style={localStyles.chartTitle}>Cumulative surplus (trend)</Text>
        <GrowthChart data={lineData} variant="line" />
      </View>

      <SectionHeader title="Month by month" />
      {months.map((month) => {
        const showValue = (value: number) =>
          month.hasActivity && value > 0 ? formatCurrency(value) : '—';

        return (
          <View key={month.monthKey} style={localStyles.monthBlock}>
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

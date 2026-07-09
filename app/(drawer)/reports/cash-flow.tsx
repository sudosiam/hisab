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
import { getCashFlowReport } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { formatCurrency, formatSignedCurrency } from '../../../src/utils/format';
import { MoneyText, moneyRowStyles } from '../../../src/components/MoneyText';
import { ErrorState, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareCashFlowPdf } from '../../../src/services/reportPdf';
import { radius, spacing, typography } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';

export default function CashFlowReportScreen() {
  const { refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...cardSurface(colors, isDark),
          padding: spacing.lg,
          marginBottom: spacing.md,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textSecondary, textTransform: 'uppercase' },
        heroValue: {
          marginTop: spacing.sm,
          textAlign: 'center',
        },
        heroSub: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
        card: {
          ...cardSurface(colors, isDark),
          borderRadius: radius.md,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        line: { ...moneyRowStyles.row, paddingVertical: spacing.sm },
        lineLabel: { fontSize: 14, color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        lineValue: { maxWidth: '50%' },
        sectionNet: {
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          marginTop: spacing.xs,
          paddingTop: spacing.sm,
        },
        bold: { fontWeight: '700' },
        pos: { color: colors.success, fontWeight: '700' },
        neg: { color: colors.danger, fontWeight: '700' },
        highlight: { color: colors.text, fontSize: 16, fontWeight: '600' },
      }),
    [colors, isDark]
  );
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [data, setData] = useState<Awaited<ReturnType<typeof getCashFlowReport>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    setPeriodLoading(true);
    try {
      setData(await getCashFlowReport(monthKey));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cash flow');
    } finally {
      setPeriodLoading(false);
    }
  }, [monthKey, refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportPdf = useCallback(async () => {
    if (!data) return { success: false, message: 'Report not loaded yet.' };
    return shareCashFlowPdf(monthKey, data);
  }, [monthKey, data]);

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

      <View style={[localStyles.hero, periodLoading && { opacity: 0.5 }]}>
        <Text style={localStyles.heroLabel}>Net Cash Change</Text>
        <MoneyText
          amount={data.netChange}
          text={formatSignedCurrency(data.netChange)}
          size="hero"
          color={data.netChange < 0 ? colors.danger : colors.text}
          style={localStyles.heroValue}
        />
        <Text style={localStyles.heroSub} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
          Opening {formatCurrency(data.openingCash)} → Closing {formatCurrency(data.closingCash)}
        </Text>
      </View>

      <SectionHeader title="Operating Activities" />
      <View style={localStyles.card}>
        <Line localStyles={localStyles} label="Cash from customers" value={data.operating.customerReceipts} />
        <Line localStyles={localStyles} label="Other income received" value={data.operating.otherIncome} />
        <Line localStyles={localStyles} label="Paid to suppliers" value={-data.operating.supplierPayments} outflow />
        <Line localStyles={localStyles} label="Operating expenses paid" value={-data.operating.expenses} outflow />
        <Line
          localStyles={localStyles}
          label="Net operating cash"
          value={data.operating.net}
          bold
          signed
        />
      </View>

      <SectionHeader title="Investing Activities" />
      <View style={localStyles.card}>
        {data.investing.fixedAssetsAdded > 0 ? (
          <Line
            localStyles={localStyles}
            label="Fixed assets recorded (non-cash)"
            value={-data.investing.fixedAssetsAdded}
            outflow
          />
        ) : null}
        <Line localStyles={localStyles} label="Net investing cash" value={data.investing.net} bold signed />
      </View>

      <SectionHeader title="Financing Activities" />
      <View style={localStyles.card}>
        <Line localStyles={localStyles} label="Deposits / capital in" value={data.financing.deposits} />
        <Line localStyles={localStyles} label="Withdrawals" value={-data.financing.withdrawals} outflow />
        <Line localStyles={localStyles} label="Net financing cash" value={data.financing.net} bold signed />
      </View>
    </ScrollView>
  );
}

function Line({
  label,
  value,
  bold,
  outflow,
  signed,
  localStyles,
}: {
  label: string;
  value: number;
  bold?: boolean;
  outflow?: boolean;
  signed?: boolean;
  localStyles: {
    line: ViewStyle;
    lineLabel: TextStyle;
    lineValue: TextStyle;
    bold: TextStyle;
    pos: TextStyle;
    neg: TextStyle;
    highlight: TextStyle;
    sectionNet: ViewStyle;
  };
}) {
  const { colors } = useTheme();
  const display = signed
    ? formatSignedCurrency(value)
    : outflow
      ? formatCurrency(Math.abs(value))
      : formatCurrency(value);

  return (
    <View style={[localStyles.line, bold && localStyles.sectionNet]}>
      <Text style={[localStyles.lineLabel, bold && localStyles.bold]} numberOfLines={2}>
        {label}
      </Text>
      <MoneyText
        amount={value}
        text={display}
        size={bold ? 'lg' : 'md'}
        color={
          signed && value > 0
            ? colors.success
            : signed && value < 0
              ? colors.danger
              : outflow
                ? colors.danger
                : undefined
        }
        style={localStyles.lineValue}
      />
    </View>
  );
}

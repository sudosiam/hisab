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
import { getProfitLossReport } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { formatCurrency } from '../../../src/utils/format';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
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
        line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
        lineLabel: { fontSize: 14, color: colors.text },
        lineValue: { fontSize: 14, color: colors.text },
        bold: { fontWeight: '700' },
        highlight: { color: colors.primary, fontSize: 18 },
        neg: { color: colors.danger },
      }),
    [colors]
  );
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [data, setData] = useState<Awaited<ReturnType<typeof getProfitLossReport>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setData(await getProfitLossReport(monthKey));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    }
  }, [monthKey, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
      <View style={localStyles.card}>
        <Line localStyles={localStyles} label="Revenue (Sales)" value={data.revenue} />
        <Line localStyles={localStyles} label="Cost of Goods Sold" value={-data.cogs} negative />
        <Line localStyles={localStyles} label="Gross Profit" value={data.grossProfit} bold />
        <Line localStyles={localStyles} label="Other Income" value={data.otherIncome} />
        <Line localStyles={localStyles} label="Operating Expenses" value={-data.expenses} negative />
        <Line localStyles={localStyles} label="Net Profit" value={data.netProfit} bold highlight />
      </View>
    </ScrollView>
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
      <Text style={[localStyles.lineLabel, bold && localStyles.bold]}>{label}</Text>
      <Text style={[localStyles.lineValue, bold && localStyles.bold, highlight && localStyles.highlight, negative && localStyles.neg]}>
        {formatCurrency(Math.abs(value))}
      </Text>
    </View>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getProfitLossReport } from '../../../src/services/reports';
import { getCurrentMonthKey } from '../../../src/utils/date';
import { formatCurrency } from '../../../src/utils/format';
import { useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';

export default function ProfitLossReportScreen() {
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
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey());
  const [data, setData] = useState<Awaited<ReturnType<typeof getProfitLossReport>> | null>(null);

  useFocusEffect(useCallback(() => { getProfitLossReport(monthKey).then(setData); }, [monthKey]));

  if (!data) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
      <View style={localStyles.card}>
        <Line localStyles={localStyles} label="Revenue (Sales)" value={data.revenue} />
        <Line localStyles={localStyles} label="Cost of Goods Sold" value={-data.cogs} negative />
        <Line localStyles={localStyles} label="Gross Profit" value={data.grossProfit} bold />
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

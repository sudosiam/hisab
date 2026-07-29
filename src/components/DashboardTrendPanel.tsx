import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { cardSurface } from '../constants/shadows';
import { spacing, typography } from '../constants/theme';
import { MultiLineTrendChart } from './MultiLineTrendChart';
import { SectionHeader } from './ui';
import type { DashboardTrend } from '../services/dashboard';
import { fiscalMonthLongLabel } from '../utils/date';

interface Props {
  trend: DashboardTrend | null;
  amountsHidden?: boolean;
}

export function DashboardTrendPanel({ trend, amountsHidden = false }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const chart = useMemo(() => {
    if (!trend?.available) {
      return {
        labels: [] as string[],
        series: [] as ReturnType<typeof buildSeries>,
        selectedLabels: [] as string[],
      };
    }
    return {
      labels: trend.days.map((d) => d.shortLabel),
      series: buildSeries(trend, colors),
      selectedLabels: trend.days.map((d) =>
        trend.granularity === 'day'
          ? `Day ${d.shortLabel}`
          : d.date.length === 7
            ? fiscalMonthLongLabel(d.date)
            : d.shortLabel
      ),
    };
  }, [trend, colors]);

  const hasAnyActivity = useMemo(
    () =>
      !!trend?.available &&
      trend.days.some(
        (d) => d.sales !== 0 || d.purchases !== 0 || d.expenses !== 0 || d.netProfit !== 0
      ),
    [trend]
  );

  const title = trend?.granularity === 'month' ? 'Monthly trend' : 'Daily trend';

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <SectionHeader title={title} tight />
        </View>
        {trend?.periodLabel ? <Text style={styles.periodLabel}>{trend.periodLabel}</Text> : null}
      </View>

      {amountsHidden ? (
        <Text style={styles.placeholder}>Amounts hidden</Text>
      ) : !trend ? (
        <Text style={styles.placeholder}>Loading…</Text>
      ) : !trend.available ? (
        <Text style={styles.placeholder}>No trend for this period</Text>
      ) : !hasAnyActivity ? (
        <Text style={styles.placeholder}>
          {trend.granularity === 'month' ? 'No activity in this period' : 'No activity this month'}
        </Text>
      ) : (
        <MultiLineTrendChart
          labels={chart.labels}
          series={chart.series}
          height={180}
          pointLabel={trend.granularity === 'month' ? 'Month' : 'Day'}
          selectedLabels={chart.selectedLabels}
        />
      )}
    </View>
  );
}

function buildSeries(trend: DashboardTrend, colors: ReturnType<typeof useTheme>['colors']) {
  return [
    {
      key: 'sales',
      label: 'Sales',
      shortLabel: 'Sales',
      color: colors.primary,
      values: trend.days.map((d) => d.sales),
    },
    {
      key: 'purchases',
      label: 'Purchases',
      shortLabel: 'Purch',
      color: colors.warning,
      dash: '2 4',
      values: trend.days.map((d) => d.purchases),
    },
    {
      key: 'expenses',
      label: 'Expenses',
      shortLabel: 'Exp',
      color: colors.danger,
      dash: '6 3',
      values: trend.days.map((d) => d.expenses),
    },
    {
      key: 'netProfit',
      label: 'Net profit',
      shortLabel: 'Profit',
      color: colors.success,
      values: trend.days.map((d) => d.netProfit),
    },
  ];
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    panel: {
      ...cardSurface(colors, isDark),
      padding: spacing.md,
      gap: spacing.md,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: -spacing.xs,
    },
    headerTitle: {
      flex: 1,
      minWidth: 0,
    },
    periodLabel: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    placeholder: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
}

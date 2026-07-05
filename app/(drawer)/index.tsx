import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StatCard } from '../../src/components/StatCard';
import { MonthPicker } from '../../src/components/MonthPicker';
import { RecentActivityList } from '../../src/components/RecentActivityList';
import { useScreenStyles, DashboardShortcuts, SectionHeader } from '../../src/components/ui';
import { getRecentActivities } from '../../src/services/activity';
import { getDashboardStats } from '../../src/services/dashboard';
import { syncPartiesFromTransactions } from '../../src/services/parties';
import { getCurrentMonthKey } from '../../src/utils/date';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { spacing } from '../../src/constants/theme';
import type { ActivityItem } from '../../src/services/activity';
import type { DashboardStats } from '../../src/types';

export default function DashboardScreen() {
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await syncPartiesFromTransactions();
    const [data, recent] = await Promise.all([
      getDashboardStats(monthKey),
      getRecentActivities(10),
    ]);
    setStats(data);
    setActivities(recent);
    setLoading(false);
    setRefreshing(false);
  }, [monthKey]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load, refreshKey])
  );

  if (loading && !stats) {
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
            load();
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <MonthPicker monthKey={monthKey} onChange={setMonthKey} />

      <SectionHeader title="This Month" />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <StatCard label="Sold" value={stats?.sold ?? 0} color={colors.accent} />
        <StatCard label="Purchased" value={stats?.purchased ?? 0} />
        <StatCard label="Gross Profit" value={stats?.grossProfit ?? 0} color={colors.success} />
        <StatCard label="Net Profit" value={stats?.netProfit ?? 0} color={colors.primary} />
        <StatCard label="Expense" value={stats?.expense ?? 0} color={colors.warning} />
        <StatCard label="Total Liquid" value={stats?.totalLiquid ?? 0} />
        <StatCard label="Inventory Value" value={stats?.inventoryValue ?? 0} color={colors.accent} />
        <StatCard label="Receivable" value={stats?.receivable ?? 0} color={colors.danger} />
      </View>

      <DashboardShortcuts />

      <SectionHeader title="Recent Activity" />
      <RecentActivityList items={activities} />
    </ScrollView>
  );
}

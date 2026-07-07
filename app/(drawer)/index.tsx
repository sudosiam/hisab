import React, { useCallback, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { formatSqliteError } from '../../src/db/database';
import { StatCard } from '../../src/components/StatCard';
import { MonthPicker } from '../../src/components/MonthPicker';
import { RecentActivityList } from '../../src/components/RecentActivityList';
import {
  useScreenStyles,
  DashboardShortcuts,
  ErrorState,
  SectionHeader,
} from '../../src/components/ui';
import { getRecentActivities } from '../../src/services/activity';
import { getDashboardStats } from '../../src/services/dashboard';
import { getPeriodSectionTitle } from '../../src/utils/date';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useSyncedPeriodKey } from '../../src/hooks/useSyncedPeriodKey';
import { spacing } from '../../src/constants/theme';
import type { ActivityItem } from '../../src/services/activity';
import type { DashboardStats } from '../../src/types';

export default function DashboardScreen() {
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [data, recent] = await Promise.all([
      getDashboardStats(monthKey),
      getRecentActivities(10),
    ]);
    setStats(data);
    setActivities(recent);
  }, [monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, monthKey]);

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && !stats) {
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
            load()
              .catch((e) => Alert.alert('Refresh failed', formatSqliteError(e)))
              .finally(() => setRefreshing(false));
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <MonthPicker monthKey={monthKey} onChange={setMonthKey} />

      <SectionHeader title={getPeriodSectionTitle(monthKey)} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <StatCard label="Sold" value={stats?.sold ?? 0} color={colors.text} />
        <StatCard label="Purchased" value={stats?.purchased ?? 0} color={colors.warning} />
        <StatCard label="Gross Profit" value={stats?.grossProfit ?? 0} color={colors.success} />
        <StatCard label="Net Profit" value={stats?.netProfit ?? 0} color={colors.success} />
        <StatCard label="Expense" value={stats?.expense ?? 0} color={colors.danger} />
        <StatCard label="Total Liquid" value={stats?.totalLiquid ?? 0} color={colors.text} />
        <StatCard label="Inventory Value" value={stats?.inventoryValue ?? 0} color={colors.text} />
        <StatCard label="Receivable" value={stats?.receivable ?? 0} color={colors.danger} />
      </View>

      <DashboardShortcuts />

      <SectionHeader title="Recent Activity" />
      <RecentActivityList items={activities} />
    </ScrollView>
  );
}

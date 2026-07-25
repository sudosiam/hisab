import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { DashboardSkeleton } from '../../src/components/Skeleton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { formatSqliteError } from '../../src/db/database';
import { StatCard } from '../../src/components/StatCard';
import { MonthPicker } from '../../src/components/MonthPicker';
import { RecentActivityList } from '../../src/components/RecentActivityList';
import {
  useScreenStyles,
  DashboardShortcuts,
  ErrorState,
  FinanceHero,
  SectionHeader,
} from '../../src/components/ui';
import { getRecentActivitiesGrouped } from '../../src/services/activity';
import { getDashboardStats } from '../../src/services/dashboard';
import { getPeriodSectionTitle } from '../../src/utils/date';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useSyncedPeriodKey } from '../../src/hooks/useSyncedPeriodKey';
import { spacing } from '../../src/constants/theme';
import type { GroupedRecentActivity } from '../../src/services/activity';
import type { DashboardStats } from '../../src/types';

const AMOUNTS_HIDDEN_KEY = '@hisab/dashboard_amounts_hidden';

export default function DashboardScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [debouncedRefreshKey, setDebouncedRefreshKey] = useState(refreshKey);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<GroupedRecentActivity>({
    sales: [],
    purchases: [],
    expenses: [],
  });
  const [refreshing, setRefreshing] = useState(false);
  const [amountsHidden, setAmountsHidden] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(AMOUNTS_HIDDEN_KEY).then((stored) => {
      if (stored === '1') setAmountsHidden(true);
    });
  }, []);

  // Coalesce rapid DB writes so the dashboard does not flash on every save.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRefreshKey(refreshKey), 250);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  const toggleAmountsHidden = useCallback(() => {
    setAmountsHidden((prev) => {
      const next = !prev;
      AsyncStorage.setItem(AMOUNTS_HIDDEN_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const [data, recent] = await Promise.all([
      getDashboardStats(monthKey),
      getRecentActivitiesGrouped(5),
    ]);
    setStats(data);
    setActivities(recent);
  }, [monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [debouncedRefreshKey, monthKey]);

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && !stats) {
    return <DashboardSkeleton />;
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

      {stats ? (
        <FinanceHero
          stats={stats}
          amountsHidden={amountsHidden}
          onToggleAmountsHidden={toggleAmountsHidden}
          onNetWorthPress={() => router.push('/(drawer)/balance-sheet')}
          onCashPress={() => router.push('/(drawer)/banking' as never)}
          onReceivablePress={() => router.push('/(drawer)/reports/receivables' as never)}
          onPayablePress={() => router.push('/(drawer)/reports/payables' as never)}
          onInventoryPress={() => router.push('/(drawer)/inventory' as never)}
        />
      ) : null}

      <SectionHeader title={getPeriodSectionTitle(monthKey)} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <StatCard
          label="Revenue"
          value={stats?.sold ?? 0}
          color={colors.text}
          onPress={() => router.push('/(drawer)/sales' as never)}
          blurred={amountsHidden}
        />
        <StatCard
          label="Purchased"
          value={stats?.purchased ?? 0}
          color={colors.warning}
          onPress={() => router.push('/(drawer)/purchases' as never)}
          blurred={amountsHidden}
        />
        <StatCard
          label="Other Income"
          value={stats?.otherIncome ?? 0}
          color={colors.success}
          onPress={() => router.push('/(drawer)/other-income' as never)}
          blurred={amountsHidden}
        />
        <StatCard
          label="Expenses"
          value={stats?.expense ?? 0}
          color={colors.danger}
          onPress={() => router.push('/(drawer)/expense' as never)}
          blurred={amountsHidden}
        />
      </View>

      <DashboardShortcuts />

      <SectionHeader title="Recent activity" />
      <RecentActivityList grouped={activities} amountsHidden={amountsHidden} />
    </ScrollView>
  );
}

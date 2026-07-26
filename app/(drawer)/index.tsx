import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
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
import { getDashboardStats, type AccountingBasis } from '../../src/services/dashboard';
import { getPeriodSectionTitle } from '../../src/utils/date';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useSyncedPeriodKey } from '../../src/hooks/useSyncedPeriodKey';
import { radius, spacing } from '../../src/constants/theme';
import type { GroupedRecentActivity } from '../../src/services/activity';
import type { DashboardStats } from '../../src/types';

const AMOUNTS_HIDDEN_KEY = '@hisab/dashboard_amounts_hidden';
const ACCOUNTING_BASIS_KEY = '@hisab/dashboard_accounting_basis';

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
  const [basis, setBasis] = useState<AccountingBasis>('accrual');

  const basisStyles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginBottom: spacing.sm,
          marginTop: -2,
        },
        seg: {
          flexDirection: 'row',
          backgroundColor: colors.surfaceContainer,
          borderRadius: radius.full,
          padding: 2,
        },
        opt: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.full,
          minHeight: 26,
          justifyContent: 'center',
        },
        optActive: {
          backgroundColor: colors.primaryContainer,
        },
        optText: {
          fontSize: 11,
          fontWeight: '500',
          color: colors.textMuted,
        },
        optTextActive: {
          color: colors.onPrimaryContainer,
          fontWeight: '700',
        },
      }),
    [colors]
  );

  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem(AMOUNTS_HIDDEN_KEY),
      AsyncStorage.getItem(ACCOUNTING_BASIS_KEY),
    ]).then(([hidden, storedBasis]) => {
      if (hidden === '1') setAmountsHidden(true);
      if (storedBasis === 'cash' || storedBasis === 'accrual') setBasis(storedBasis);
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

  const setAccountingBasis = useCallback((next: AccountingBasis) => {
    setBasis(next);
    void AsyncStorage.setItem(ACCOUNTING_BASIS_KEY, next);
  }, []);

  const load = useCallback(async () => {
    const [data, recent] = await Promise.all([
      getDashboardStats(monthKey, basis),
      getRecentActivitiesGrouped(5),
    ]);
    setStats(data);
    setActivities(recent);
  }, [monthKey, basis]);

  const { booting, error, retry } = useFocusRefresh(load, [debouncedRefreshKey, monthKey, basis]);

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

      <View style={basisStyles.row}>
        <View
          style={basisStyles.seg}
          accessibilityRole="tablist"
          accessibilityLabel="Accounting basis"
        >
          {(
            [
              { key: 'accrual', label: 'Accrual' },
              { key: 'cash', label: 'Cash' },
            ] as const
          ).map((opt) => {
            const active = basis === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[basisStyles.opt, active && basisStyles.optActive]}
                onPress={() => setAccountingBasis(opt.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${opt.label} mode`}
              >
                <Text style={[basisStyles.optText, active && basisStyles.optTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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

      <SectionHeader
        title={
          basis === 'cash'
            ? `${getPeriodSectionTitle(monthKey)} · Cash`
            : getPeriodSectionTitle(monthKey)
        }
      />

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

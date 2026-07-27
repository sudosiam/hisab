import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { DashboardSkeleton } from '../../src/components/Skeleton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRouter } from 'expo-router';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { formatSqliteError } from '../../src/db/database';
import { StatCard } from '../../src/components/StatCard';
import { MonthPicker } from '../../src/components/MonthPicker';
import { RecentActivityList } from '../../src/components/RecentActivityList';
import { CalculatorHeaderButton } from '../../src/components/QuickCalculator';
import {
  useScreenStyles,
  DashboardShortcuts,
  ErrorState,
  FinanceHero,
  SectionHeader,
  ACTIVE_OPACITY,
} from '../../src/components/ui';
import { ThemedPressable } from '../../src/components/ThemedPressable';
import { getRecentActivitiesGrouped } from '../../src/services/activity';
import { getDashboardStats, type AccountingBasis } from '../../src/services/dashboard';
import { getPeriodSectionTitle } from '../../src/utils/date';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useSyncedPeriodKey } from '../../src/hooks/useSyncedPeriodKey';
import { radius, spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { GroupedRecentActivity } from '../../src/services/activity';
import type { DashboardStats } from '../../src/types';

const AMOUNTS_HIDDEN_KEY = '@hisab/dashboard_amounts_hidden';
const ACCOUNTING_BASIS_KEY = '@hisab/dashboard_accounting_basis';

export default function DashboardScreen() {
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
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

  const local = useMemo(
    () =>
      StyleSheet.create({
        content: {
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.xxl,
          gap: spacing.sm,
        },
        headerRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        seg: {
          flexDirection: 'row',
          backgroundColor: colors.surfaceContainerHigh,
          borderRadius: radius.full,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 2,
          minHeight: 44,
          alignItems: 'center',
        },
        opt: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.full,
          minHeight: 40,
          minWidth: 72,
          justifyContent: 'center',
          alignItems: 'center',
        },
        optActive: {
          backgroundColor: colors.primaryContainer,
        },
        optText: {
          ...typography.caption,
          fontWeight: '600',
          color: colors.textSecondary,
          textAlign: 'center',
        },
        optTextActive: {
          color: colors.onPrimaryContainer,
          fontWeight: '700',
        },
        periodBlock: {
          marginBottom: spacing.sm,
        },
        sectionBlock: {
          marginBottom: spacing.lg,
        },
        kpiPanel: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          gap: spacing.sm,
        },
        kpiHeader: {
          marginBottom: spacing.xs,
        },
        metricGrid: {
          gap: spacing.sm,
        },
        metricRow: {
          flexDirection: 'row',
          gap: spacing.sm,
          alignItems: 'stretch',
        },
      }),
    [colors, isDark]
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={local.headerRight}>
          <View
            style={local.seg}
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
                <ThemedPressable
                  key={opt.key}
                  style={[local.opt, active && local.optActive]}
                  onPress={() => setAccountingBasis(opt.key)}
                  activeOpacity={ACTIVE_OPACITY}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${opt.label} mode`}
                >
                  <Text style={[local.optText, active && local.optTextActive]}>{opt.label}</Text>
                </ThemedPressable>
              );
            })}
          </View>
          <CalculatorHeaderButton tintColor={colors.headerText} />
        </View>
      ),
    });
  }, [navigation, basis, local, colors.headerText, setAccountingBasis]);

  const load = useCallback(async () => {
    const [data, recent] = await Promise.all([
      getDashboardStats(monthKey, basis),
      getRecentActivitiesGrouped(5),
    ]);
    setStats(data);
    setActivities(recent);
  }, [monthKey, basis]);

  const { booting, error, retry } = useFocusRefresh(load, [debouncedRefreshKey, monthKey, basis]);

  const periodTitle =
    basis === 'cash'
      ? `${getPeriodSectionTitle(monthKey)} · Cash`
      : getPeriodSectionTitle(monthKey);

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && !stats) {
    return <DashboardSkeleton />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={local.content}
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
      <View style={local.periodBlock}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
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

      <View style={local.sectionBlock}>
        <View style={local.kpiPanel}>
          <View style={local.kpiHeader}>
            <SectionHeader title={periodTitle} tight />
          </View>
          <View style={local.metricGrid}>
            <View style={local.metricRow}>
              <StatCard
                equal
                variant="inset"
                icon="cart-outline"
                label="Revenue"
                value={stats?.sold ?? 0}
                color={colors.primary}
                onPress={() => router.push('/(drawer)/sales' as never)}
                blurred={amountsHidden}
              />
              <StatCard
                equal
                variant="inset"
                icon="bag-handle-outline"
                label="Purchased"
                value={stats?.purchased ?? 0}
                color={colors.warning}
                onPress={() => router.push('/(drawer)/purchases' as never)}
                blurred={amountsHidden}
              />
            </View>
            <View style={local.metricRow}>
              <StatCard
                equal
                variant="inset"
                icon="cash-outline"
                label="Other Income"
                value={stats?.otherIncome ?? 0}
                color={colors.success}
                onPress={() => router.push('/(drawer)/other-income' as never)}
                blurred={amountsHidden}
              />
              <StatCard
                equal
                variant="inset"
                icon="receipt-outline"
                label="Expenses"
                value={stats?.expense ?? 0}
                color={colors.danger}
                onPress={() => router.push('/(drawer)/expense' as never)}
                blurred={amountsHidden}
              />
            </View>
          </View>
        </View>
      </View>

      <View style={local.sectionBlock}>
        <DashboardShortcuts />
      </View>

      <View style={local.sectionBlock}>
        <SectionHeader title="Recent activity" tight />
        <RecentActivityList grouped={activities} amountsHidden={amountsHidden} />
      </View>
    </ScrollView>
  );
}

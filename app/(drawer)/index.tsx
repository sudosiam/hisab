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
import { useFocusEffect, useNavigation } from 'expo-router';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { formatSqliteError } from '../../src/db/database';
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
import { DashboardTrendPanel } from '../../src/components/DashboardTrendPanel';
import { AnimatedSection } from '../../src/components/AnimatedPresence';
import { getRecentActivitiesGrouped } from '../../src/services/activity';
import {
  getDashboardDailyTrend,
  getDashboardStats,
  type AccountingBasis,
  type DashboardTrend,
} from '../../src/services/dashboard';
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  getDashboardPreferences,
  setDashboardAccountingBasis,
  setDashboardAmountsHidden,
  visibleSectionOrder,
  type DashboardPreferences,
  type DashboardSectionId,
} from '../../src/services/dashboardPreferences';
import { navigateFromDashboard } from '../../src/navigation/fromDashboard';
import { refreshHomeWidgets } from '../../src/services/widgetSnapshot';
import { getPeriodSectionTitle } from '../../src/utils/date';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useSyncedPeriodKey } from '../../src/hooks/useSyncedPeriodKey';
import { useFinancialYear } from '../../src/context/FinancialYearContext';
import { radius, spacing } from '../../src/constants/theme';
import type { GroupedRecentActivity } from '../../src/services/activity';
import type { DashboardStats } from '../../src/types';

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { refreshKey } = useDatabase();
  const { fyRevision } = useFinancialYear();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [debouncedRefreshKey, setDebouncedRefreshKey] = useState(refreshKey);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trend, setTrend] = useState<DashboardTrend | null>(null);
  const [activities, setActivities] = useState<GroupedRecentActivity>({
    sales: [],
    purchases: [],
    expenses: [],
  });
  const [refreshing, setRefreshing] = useState(false);
  const [prefs, setPrefs] = useState<DashboardPreferences>(DEFAULT_DASHBOARD_PREFERENCES);
  const [prefsReady, setPrefsReady] = useState(false);

  const amountsHidden = prefs.amountsHidden;
  const basis = prefs.accountingBasis;
  const sectionOrder = useMemo(() => visibleSectionOrder(prefs), [prefs]);

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
          borderRadius: radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 1,
          minHeight: 28,
          alignItems: 'center',
        },
        opt: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: radius.sm - 1,
          minHeight: 26,
          minWidth: 44,
          justifyContent: 'center',
          alignItems: 'center',
        },
        optActive: {
          backgroundColor: colors.primaryContainer,
        },
        optText: {
          fontSize: 11,
          lineHeight: 14,
          fontWeight: '500',
          color: colors.textSecondary,
          textAlign: 'center',
        },
        optTextActive: {
          color: colors.onPrimaryContainer,
          fontWeight: '600',
        },
        periodBlock: {
          marginBottom: spacing.sm,
        },
        sectionBlock: {
          marginBottom: spacing.lg,
        },
      }),
    [colors]
  );

  const loadPrefs = useCallback(async () => {
    try {
      setPrefs(await getDashboardPreferences());
    } catch (err) {
      console.warn('[dashboard] prefs load failed', err);
    } finally {
      setPrefsReady(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPrefs();
    }, [loadPrefs])
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRefreshKey(refreshKey), 250);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  const toggleAmountsHidden = useCallback(() => {
    setPrefs((prev) => {
      const next = !prev.amountsHidden;
      void setDashboardAmountsHidden(next).catch((err) =>
        console.warn('[dashboard] hide amounts save failed', err)
      );
      return { ...prev, amountsHidden: next };
    });
  }, []);

  const setAccountingBasis = useCallback((next: AccountingBasis) => {
    setPrefs((prev) => ({ ...prev, accountingBasis: next }));
    void setDashboardAccountingBasis(next).catch((err) =>
      console.warn('[dashboard] basis save failed', err)
    );
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={local.headerRight}>
          {prefs.showBasisToggle ? (
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
                    hitSlop={6}
                  >
                    <Text style={[local.optText, active && local.optTextActive]}>{opt.label}</Text>
                  </ThemedPressable>
                );
              })}
            </View>
          ) : null}
          <CalculatorHeaderButton tintColor={colors.headerText} />
        </View>
      ),
    });
  }, [
    navigation,
    basis,
    local,
    colors.headerText,
    setAccountingBasis,
    prefs.showBasisToggle,
  ]);

  const load = useCallback(async () => {
    const [data, recent, monthly] = await Promise.all([
      getDashboardStats(monthKey, basis),
      getRecentActivitiesGrouped(prefs.recentActivityLimit, monthKey),
      getDashboardDailyTrend(monthKey, basis),
    ]);
    setStats(data);
    setActivities(recent);
    setTrend(monthly);
    void refreshHomeWidgets();
  }, [monthKey, basis, prefs.recentActivityLimit]);

  const { booting, error, retry } = useFocusRefresh(load, [
    debouncedRefreshKey,
    monthKey,
    basis,
    fyRevision,
    prefs.recentActivityLimit,
    prefsReady,
  ]);

  const periodTitle =
    basis === 'cash'
      ? `${getPeriodSectionTitle(monthKey)} · Cash`
      : getPeriodSectionTitle(monthKey);

  const renderSection = (id: DashboardSectionId, index: number) => {
    switch (id) {
      case 'hero':
        return stats ? (
          <AnimatedSection key={id} index={index} style={local.sectionBlock}>
            <FinanceHero
              stats={stats}
              amountsHidden={amountsHidden}
              periodLabel={periodTitle}
              onToggleAmountsHidden={toggleAmountsHidden}
              onProfitPress={() =>
                navigateFromDashboard(navigation, { drawer: 'reports', screen: 'profit-loss' })
              }
              onRevenuePress={() =>
                navigateFromDashboard(navigation, { drawer: 'sales', screen: 'index' })
              }
              onPurchasedPress={() =>
                navigateFromDashboard(navigation, { drawer: 'purchases', screen: 'index' })
              }
              onOtherIncomePress={() =>
                navigateFromDashboard(navigation, { drawer: 'other-income', screen: 'index' })
              }
              onExpensesPress={() =>
                navigateFromDashboard(navigation, { drawer: 'expense', screen: 'index' })
              }
              onNetWorthPress={() =>
                navigateFromDashboard(navigation, { drawer: 'balance-sheet' })
              }
              onCashPress={() =>
                navigateFromDashboard(navigation, { drawer: 'banking', screen: 'index' })
              }
              onReceivablePress={() =>
                navigateFromDashboard(navigation, { drawer: 'reports', screen: 'receivables' })
              }
              onPayablePress={() =>
                navigateFromDashboard(navigation, { drawer: 'reports', screen: 'payables' })
              }
              onInventoryPress={() =>
                navigateFromDashboard(navigation, { drawer: 'inventory', screen: 'index' })
              }
            />
          </AnimatedSection>
        ) : null;
      case 'trend':
        return (
          <AnimatedSection key={id} index={index} style={local.sectionBlock}>
            <DashboardTrendPanel trend={trend} amountsHidden={amountsHidden} />
          </AnimatedSection>
        );
      case 'shortcuts':
        return (
          <AnimatedSection key={id} index={index} style={local.sectionBlock}>
            <DashboardShortcuts />
          </AnimatedSection>
        );
      case 'activity':
        return (
          <AnimatedSection key={id} index={index} style={local.sectionBlock}>
            <SectionHeader title="Recent in period" tight />
            <RecentActivityList grouped={activities} amountsHidden={amountsHidden} />
          </AnimatedSection>
        );
      default:
        return null;
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if ((booting || !prefsReady) && !stats) {
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
      {prefs.showPeriodPicker ? (
        <AnimatedSection index={0} style={local.periodBlock}>
          <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        </AnimatedSection>
      ) : null}

      {sectionOrder.map((id, index) => renderSection(id, index + 1))}
    </ScrollView>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { ErrorState, SearchField, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { getOtherIncome } from '../../../src/services/otherIncome';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { getPeriodTotalLabel } from '../../../src/utils/date';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing, radius } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import type { OtherIncome } from '../../../src/types';

export default function OtherIncomeListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        fab: {
          position: 'absolute',
          bottom: spacing.lg,
          right: spacing.lg,
          backgroundColor: colors.success,
          paddingHorizontal: spacing.lg,
          paddingVertical: 14,
          borderRadius: radius.xl,
        },
        fabText: { color: colors.onPrimary, fontWeight: '700' },
        row: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
      }),
    [colors, isDark]
  );

  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [items, setItems] = useState<OtherIncome[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setItems(await getOtherIncome(monthKey));
  }, [monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, monthKey]);

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        matchesSearch(search, [item.category, item.description, item.date, item.account_name])
      ),
    [items, search]
  );

  const monthTotal = filtered.reduce((sum, item) => sum + item.amount, 0);

  const renderItem = useCallback(
    ({ item }: { item: OtherIncome }) => (
      <TouchableOpacity
        style={localStyles.row}
        onPress={() => router.push(`/(drawer)/other-income/${item.id}` as never)}
        activeOpacity={0.75}
      >
        <View style={styles.row}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.category}
          </Text>
          <Text style={[styles.amount, { color: colors.success }]}>
            {formatCurrency(item.amount)}
          </Text>
        </View>
        <Text style={styles.cardSub} numberOfLines={2}>
          {item.description}
        </Text>
        <Text style={styles.cardSub}>
          {item.date} · {item.account_name}
        </Text>
      </TouchableOpacity>
    ),
    [colors.success, localStyles, router, styles]
  );

  if (error && items.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  const header = (
    <View>
      <MonthPicker monthKey={monthKey} onChange={setMonthKey} />

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search category, description, account..."
      />

      <View style={styles.row}>
        <Text style={styles.cardTitle}>
          {search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
        </Text>
        <Text style={[styles.amount, { color: colors.success }]}>{formatCurrency(monthTotal)}</Text>
      </View>

      <SectionHeader title="Other Income" />
      {booting ? <ActivityIndicator color={colors.primary} /> : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={booting && items.length === 0 ? [] : filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
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
        {...FLATLIST_PERF}
        ListEmptyComponent={
          booting ? null : (
            <Text style={styles.empty}>
              {search.trim() ? 'No entries match your search.' : 'No other income this month'}
            </Text>
          )
        }
      />

      <TouchableOpacity
        style={localStyles.fab}
        onPress={() => router.push('/(drawer)/other-income/new' as never)}
        accessibilityLabel="Add income"
      >
        <Text style={localStyles.fabText}>+ Add Income</Text>
      </TouchableOpacity>
    </View>
  );
}

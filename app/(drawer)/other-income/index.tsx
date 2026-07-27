import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { ListItem } from '../../../src/components/ListItem';
import { MoneyTotalRow } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { ErrorState, EmptyState, Fab, SearchField, SectionHeader, useScreenStyles, useFabListPadding } from '../../../src/components/ui';
import { getOtherIncome } from '../../../src/services/otherIncome';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { getPeriodTotalLabel, formatDisplayDate } from '../../../src/utils/date';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';
import type { OtherIncome } from '../../../src/types';

export default function OtherIncomeListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const fabListPadding = useFabListPadding();

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
      <ListItem
        title={item.category}
        subtitle={item.description}
        meta={`${formatDisplayDate(item.date)} · ${item.account_name}`}
        amount={item.amount}
        amountColor={colors.success}
        onPress={() => router.push(`/(drawer)/other-income/${item.id}` as never)}
        accessibilityLabel={`Income ${item.category}`}
      />
    ),
    [colors.success, router]
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

      <MoneyTotalRow
        label={search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
        amount={monthTotal}
        amountColor={colors.success}
      />

      <SectionHeader title="Other Income" />
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={booting && items.length === 0 ? [] : filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingTop: spacing.sm, paddingBottom: fabListPadding }]}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load()
                .catch((e) => alertRefreshFailed(e))
                .finally(() => setRefreshing(false));
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        ListEmptyComponent={
          booting && items.length === 0 ? (
            <ListSkeleton />
          ) : search.trim() ? (
            <EmptyState
              title="No matches"
              message="Try a different search."
            />
          ) : (
            <EmptyState
              title="No other income yet"
              message="Record other income for this period."
              actionLabel="Add Income"
              onAction={() => router.push('/(drawer)/other-income/new' as never)}
            />
          )
        }
      />

      <Fab label="+ Add Income" onPress={() => router.push('/(drawer)/other-income/new' as never)} />
    </View>
  );
}

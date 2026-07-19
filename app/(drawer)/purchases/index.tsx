import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getPurchases } from '../../../src/services/purchases';
import { StatusBadge } from '../../../src/components/StatusBadge';
import {
  ErrorState,
  Fab,
  FilterChip,
  FilterRow,
  SearchField,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { formatDisplayDate, getPeriodTotalLabel } from '../../../src/utils/date';
import { matchesSearch } from '../../../src/utils/search';
import { useTheme } from '../../../src/context/ThemeContext';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { spacing } from '../../../src/constants/theme';
import type { Purchase } from '../../../src/types';

type Filter = 'all' | 'paid' | 'unpaid';

export default function PurchasesListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredPurchases = useMemo(
    () =>
      purchases.filter((item) =>
        matchesSearch(search, [
          item.invoice_no,
          item.supplier_name,
          item.vendor_invoice_no,
          item.date,
          item.notes,
          item.status,
        ])
      ),
    [purchases, search]
  );

  const periodTotal = useMemo(
    () => filteredPurchases.reduce((sum, item) => sum + item.total_amount, 0),
    [filteredPurchases]
  );

  const periodDue = useMemo(
    () =>
      filteredPurchases.reduce(
        (sum, item) => sum + Math.max(0, item.total_amount - item.paid_amount),
        0
      ),
    [filteredPurchases]
  );

  const load = useCallback(async () => {
    setPurchases(await getPurchases(filter, { periodKey: monthKey }));
  }, [filter, monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, filter, monthKey]);

  const renderItem = useCallback(
    ({ item }: { item: Purchase }) => (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(drawer)/purchases/${item.id}`)}
      >
        <View style={styles.row}>
          <Text style={styles.cardTitle}>{item.invoice_no}</Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.cardSub}>{item.supplier_name}</Text>
        <View style={styles.row}>
          <Text style={styles.cardSub}>{formatDisplayDate(item.date)}</Text>
          <Text style={styles.amount}>{formatCurrency(item.total_amount)}</Text>
        </View>
        {item.paid_amount < item.total_amount && (
          <Text style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>
            Due: {formatCurrency(item.total_amount - item.paid_amount)}
          </Text>
        )}
      </TouchableOpacity>
    ),
    [colors.danger, router, styles]
  );

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.sm }}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        <View style={[styles.row, { marginBottom: spacing.sm }]}>
          <Text style={styles.cardTitle}>
            {search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
          </Text>
          <Text style={styles.amount}>{formatCurrency(periodTotal)}</Text>
        </View>
        {periodDue > 0.01 && (
          <View style={[styles.row, { marginBottom: spacing.sm }]}>
            <Text style={styles.cardSub}>Outstanding in period</Text>
            <Text style={[styles.amount, { color: colors.danger, fontSize: 15 }]}>
              {formatCurrency(periodDue)}
            </Text>
          </View>
        )}
      </View>

      <FilterRow>
        {(['all', 'paid', 'unpaid'] as Filter[]).map((f) => (
          <FilterChip
            key={f}
            label={f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Outstanding'}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </FilterRow>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search invoice, supplier, date..."
      />

      {booting && purchases.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredPurchases}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load()
                  .catch(() => {})
                  .finally(() => setRefreshing(false));
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          {...FLATLIST_PERF}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim()
                ? 'No purchases match your search.'
                : 'No purchases in this period.'}
            </Text>
          }
        />
      )}

      <Fab label="+ New Purchase" onPress={() => router.push('/(drawer)/purchases/new' as never)} />
    </View>
  );
}

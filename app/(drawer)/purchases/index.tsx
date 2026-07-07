import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { getPurchases } from '../../../src/services/purchases';
import { StatusBadge } from '../../../src/components/StatusBadge';
import {
  ErrorState,
  FilterChip,
  FilterRow,
  SearchField,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import type { Purchase } from '../../../src/types';

type Filter = 'all' | 'paid' | 'unpaid';

export default function PurchasesListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
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

  // `load` changes when `filter` changes, so the focus-refresh hook re-runs
  // for filter switches too — no separate effect (which double-fetched).
  const load = useCallback(async () => {
    setPurchases(await getPurchases(filter));
  }, [filter]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, filter]);

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
          <Text style={styles.cardSub}>{item.date}</Text>
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
              {search.trim() ? 'No purchases match your search.' : 'No purchases yet.'}
            </Text>
          }
        />
      )}

      <Link href="/(drawer)/purchases/new" asChild>
        <TouchableOpacity style={styles.fab}>
          <Text style={styles.fabText}>+ New Purchase</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

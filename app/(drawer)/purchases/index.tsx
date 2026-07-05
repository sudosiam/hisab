import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { getPurchases } from '../../../src/services/purchases';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { FilterChip, FilterRow, SearchField, useScreenStyles } from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
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
  const [loading, setLoading] = useState(true);

  const filteredPurchases = useMemo(
    () =>
      purchases.filter((item) =>
        matchesSearch(search, [item.invoice_no, item.supplier_name, item.date, item.notes, item.status])
      ),
    [purchases, search]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getPurchases(filter);
    setPurchases(data);
    setLoading(false);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, refreshKey])
  );

  return (
    <View style={styles.container}>
      <FilterRow>
        {(['all', 'paid', 'unpaid'] as Filter[]).map((f) => (
          <FilterChip
            key={f}
            label={f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Unpaid'}
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

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredPurchases}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() ? 'No purchases match your search.' : 'No purchases yet.'}
            </Text>
          }
          renderItem={({ item }) => (
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
            </TouchableOpacity>
          )}
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

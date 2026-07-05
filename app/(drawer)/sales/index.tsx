import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { getSales } from '../../../src/services/sales';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { FilterChip, FilterRow, SearchField, useScreenStyles } from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import type { Sale } from '../../../src/types';

type Filter = 'all' | 'paid' | 'unpaid';

export default function SalesListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const filteredSales = useMemo(
    () =>
      sales.filter((item) =>
        matchesSearch(search, [item.invoice_no, item.party_name, item.date, item.notes, item.status])
      ),
    [sales, search]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getSales(filter);
    setSales(data);
    setLoading(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load, refreshKey]));

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
        placeholder="Search invoice, customer, date..."
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredSales}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() ? 'No sales match your search.' : 'No sales yet. Create your first sale.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(drawer)/sales/${item.id}`)}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{item.invoice_no}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.cardSub}>{item.party_name}</Text>
              <View style={[styles.row, { marginTop: 4 }]}>
                <Text style={styles.cardSub}>{item.date}</Text>
                <Text style={styles.amount}>{formatCurrency(item.total_amount)}</Text>
              </View>
              {item.paid_amount < item.total_amount && (
                <Text style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>
                  Due: {formatCurrency(item.total_amount - item.paid_amount)}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      <Link href="/(drawer)/sales/new" asChild>
        <TouchableOpacity style={styles.fab}>
          <Text style={styles.fabText}>+ New Sale</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

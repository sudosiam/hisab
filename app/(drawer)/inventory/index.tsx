import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { ErrorState, SearchField, useScreenStyles } from '../../../src/components/ui';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { formatCurrency, formatQty } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import type { Product } from '../../../src/types';

function matchesCategory(product: Product, categoryFilter: string): boolean {
  if (!categoryFilter) return true;
  const cat = product.category?.trim() ?? '';
  return cat.toLowerCase() === categoryFilter.toLowerCase();
}

export default function InventoryListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        qty: { fontSize: 14, color: colors.primary, fontWeight: '600' },
        value: { fontSize: 13, marginTop: 4, fontWeight: '500', color: colors.text },
        opening: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
        filters: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
      }),
    [colors]
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (item) => matchesCategory(item, categoryFilter) && matchesSearch(search, [item.name, item.sku, item.unit, item.category])
      ),
    [products, search, categoryFilter]
  );

  const load = useCallback(async () => {
    setProducts(await getProducts());
  }, []);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey]);

  const emptyMessage = search.trim() || categoryFilter
    ? 'No products match your filters.'
    : 'No products. Add your first item.';

  if (error && products.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.filters}>
        <CategoryPicker
          label="Category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          allowAll
          allLabel="All categories"
          placeholder="All categories"
          onCategoryDeleted={load}
        />
      </View>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search product, SKU, or category..."
      />

      {booting && products.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
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
          ListEmptyComponent={<Text style={styles.empty}>{emptyMessage}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(drawer)/inventory/${item.id}`)}
            >
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.category ? (
                <Text style={styles.cardSub}>{item.category}</Text>
              ) : null}
              {item.sku ? <Text style={styles.cardSub}>SKU: {item.sku}</Text> : null}
              <View style={[styles.row, { marginTop: spacing.sm }]}>
                <Text style={localStyles.qty}>Stock: {formatQty(item.current_qty, item.unit)}</Text>
                <Text style={styles.cardSub}>Cost: {formatCurrency(item.avg_cost)}</Text>
              </View>
              <Text style={localStyles.value}>
                Sell: {formatCurrency(getProductSellPrice(item))}
              </Text>
              <Text style={localStyles.opening}>
                Stock value: {formatCurrency(item.current_qty * item.avg_cost)}
                {' · '}
                Opening: {formatQty(item.opening_qty, item.unit)} @ {formatCurrency(item.opening_cost)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Link href="/(drawer)/inventory/new" asChild>
        <TouchableOpacity style={styles.fab}>
          <Text style={styles.fabText}>+ Add Product</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

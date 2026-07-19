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
import { useRouter } from 'expo-router';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { ErrorState, Fab, SearchField, useScreenStyles } from '../../../src/components/ui';
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
        filters: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
        row: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.xs,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderLight,
          backgroundColor: colors.surface,
        },
        name: { fontSize: 15, fontWeight: '600', color: colors.text },
        meta: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: 4,
        },
        qty: { fontSize: 13, color: colors.primary, fontWeight: '600', flexShrink: 0 },
        prices: { fontSize: 12, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
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
          contentContainerStyle={[styles.list, { paddingHorizontal: 0, paddingTop: 0 }]}
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
              style={localStyles.row}
              onPress={() => router.push(`/(drawer)/inventory/${item.id}`)}
              activeOpacity={0.7}
            >
              <Text style={localStyles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={localStyles.meta}>
                <Text style={localStyles.qty}>{formatQty(item.current_qty, item.unit)}</Text>
                <Text style={localStyles.prices} numberOfLines={1}>
                  Sell {formatCurrency(getProductSellPrice(item))} · Cost{' '}
                  {formatCurrency(item.avg_cost)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Fab label="+ Add Product" onPress={() => router.push('/(drawer)/inventory/new' as never)} />
    </View>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { ListItem } from '../../../src/components/ListItem';
import { MoneyText } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { ErrorState, EmptyState, Fab, SearchField, useScreenStyles, useFabListPadding } from '../../../src/components/ui';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { formatQty } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing } from '../../../src/constants/theme';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';
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
  const fabListPadding = useFabListPadding();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        filters: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
        prices: { width: '100%', gap: 2, alignItems: 'flex-end' },
        priceLabel: { fontSize: 10, color: colors.textMuted, textAlign: 'right' },
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
        (item) =>
          matchesCategory(item, categoryFilter) &&
          matchesSearch(search, [item.name, item.sku, item.unit, item.category])
      ),
    [products, search, categoryFilter]
  );

  const load = useCallback(async () => {
    setProducts(await getProducts());
  }, []);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey]);

  const isFiltered = search.trim() || !!categoryFilter;

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ListItem
        title={item.name}
        subtitle={formatQty(item.current_qty, item.unit)}
        meta={item.category?.trim() || item.sku || undefined}
        trailing={
          <View style={localStyles.prices}>
            <Text style={localStyles.priceLabel}>Sell</Text>
            <MoneyText amount={getProductSellPrice(item)} size="sm" style={{ width: '100%' }} />
            <Text style={localStyles.priceLabel}>Cost</Text>
            <MoneyText amount={item.avg_cost} size="sm" color={colors.textSecondary} style={{ width: '100%' }} />
          </View>
        }
        onPress={() => router.push(`/(drawer)/inventory/${item.id}`)}
        accessibilityLabel={`Product ${item.name}`}
        subtitleLines={1}
      />
    ),
    [colors.textSecondary, localStyles.priceLabel, localStyles.prices, router]
  );

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
        <ListSkeleton />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: fabListPadding }]}
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
            isFiltered ? (
              <EmptyState
                title="No matches"
                message="Try a different filter or search."
              />
            ) : (
              <EmptyState
                title="No products yet"
                message="Add your first item to track inventory."
                actionLabel="Add Product"
                onAction={() => router.push('/(drawer)/inventory/new' as never)}
              />
            )
          }
          renderItem={renderItem}
        />
      )}

      <Fab label="+ Add Product" onPress={() => router.push('/(drawer)/inventory/new' as never)} />
    </View>
  );
}

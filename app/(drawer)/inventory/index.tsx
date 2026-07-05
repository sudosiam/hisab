import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { SearchField, useScreenStyles } from '../../../src/components/ui';
import { formatCurrency, formatQty } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { spacing } from '../../../src/constants/theme';
import type { Product } from '../../../src/types';

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
      }),
    [colors]
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const filteredProducts = useMemo(
    () =>
      products.filter((item) =>
        matchesSearch(search, [item.name, item.sku, item.unit])
      ),
    [products, search]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setProducts(await getProducts());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, refreshKey]));

  return (
    <View style={styles.container}>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search product name or SKU..."
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() ? 'No products match your search.' : 'No products. Add your first item.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(drawer)/inventory/${item.id}`)}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
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

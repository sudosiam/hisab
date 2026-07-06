import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { formatCurrency, formatQty } from '../utils/format';
import { getProductSellPrice } from '../services/inventory';
import type { Product } from '../types';

interface Props {
  label?: string;
  products: Product[];
  value: number;
  onChange: (productId: number) => void;
  /** Show cost (purchase) or sell price (sale) in the list. */
  variant?: 'sale' | 'purchase';
}

function categoryLabel(product: Product): string {
  const trimmed = product.category?.trim();
  return trimmed || 'Uncategorized';
}

function productMeta(product: Product, variant: 'sale' | 'purchase'): string {
  const stock = formatQty(product.current_qty, product.unit);
  if (variant === 'purchase') {
    return `${stock} · Cost ${formatCurrency(product.avg_cost)}`;
  }
  return `${stock} · Sell ${formatCurrency(getProductSellPrice(product))}`;
}

export function ProductPicker({
  label = 'Product',
  products,
  value,
  onChange,
  variant = 'sale',
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const selected = products.find((p) => p.id === value);

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const product of products) {
      names.add(categoryLabel(product));
    }
    return ['All categories', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const [categoryFilter, setCategoryFilter] = useState('All categories');

  useEffect(() => {
    if (selected) {
      setCategoryFilter(categoryLabel(selected));
    }
  }, [selected?.id]);

  const filteredProducts = useMemo(() => {
    const pool =
      categoryFilter === 'All categories'
        ? products
        : products.filter((product) => categoryLabel(product) === categoryFilter);
    return [...pool].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categoryFilter]);

  const handleCategoryChange = (cat: string) => {
    setCategoryFilter(cat);
    setCategoryOpen(false);
  };

  return (
    <View style={styles.wrap}>
      {categories.length > 1 ? (
        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            style={styles.trigger}
            onPress={() => setCategoryOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.triggerText}>{categoryFilter}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => setProductOpen(true)}
          activeOpacity={0.75}
          disabled={filteredProducts.length === 0}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.triggerText, !selected && styles.placeholder]}>
              {selected?.name ?? 'Select product'}
            </Text>
            {selected ? <Text style={styles.meta}>{productMeta(selected, variant)}</Text> : null}
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={categoryOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCategoryOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Select Category</Text>
            <FlatList
              data={categories}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item === categoryFilter && styles.optionActive]}
                  onPress={() => handleCategoryChange(item)}
                >
                  <Text style={styles.optionText}>{item}</Text>
                  {item === categoryFilter ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={productOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProductOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setProductOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {categoryFilter === 'All categories' ? 'Select Product' : categoryFilter}
            </Text>
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                <Text style={styles.empty}>No products in this category.</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.id === value && styles.optionActive]}
                  onPress={() => {
                    onChange(item.id);
                    setCategoryFilter(categoryLabel(item));
                    setProductOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionText}>{item.name}</Text>
                    <Text style={styles.meta}>
                      {categoryFilter === 'All categories'
                        ? `${categoryLabel(item)} · ${productMeta(item, variant)}`
                        : productMeta(item, variant)}
                    </Text>
                  </View>
                  {item.id === value ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.sm, gap: spacing.sm },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      backgroundColor: colors.inputBg,
    },
    triggerText: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
    placeholder: { color: colors.textMuted, fontWeight: '500' },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      ...cardSurface(colors, isDark),
      maxHeight: '70%',
      padding: spacing.md,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    empty: { textAlign: 'center', color: colors.textMuted, paddingVertical: spacing.lg },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    optionActive: { backgroundColor: colors.navActive },
    optionText: { fontSize: 15, color: colors.text, fontWeight: '500' },
  });
}

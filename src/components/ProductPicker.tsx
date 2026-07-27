import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { elevatedSurface } from '../constants/shadows';
import { formatCurrency, formatQty, parseAmountInput } from '../utils/format';
import {
  addProductCategory,
  createProduct,
  deleteProductCategory,
  getProductCategories,
  getProductSellPrice,
} from '../services/inventory';
import { formatSqliteError } from '../db/database';
import { productCategorySource } from './categorySources';
import { FormInput, PrimaryButton } from './ui';
import { claimDropdownOpen, releaseDropdownOpen } from '../utils/dropdownOpen';
import type { Product } from '../types';

interface Props {
  label?: string;
  products: Product[];
  value: number;
  onChange: (productId: number) => void;
  /** Show cost (purchase) or sell price (sale) in the list. */
  variant?: 'sale' | 'purchase';
  onCategoryDeleted?: () => void;
  /** Called after a product is created so the parent can refresh its product list. */
  onProductCreated?: (productId: number) => void | Promise<void>;
}

function categoryLabel(product: Product): string {
  const trimmed = product.category?.trim();
  return trimmed || 'Uncategorized';
}

function productMeta(
  product: Product,
  variant: 'sale' | 'purchase'
): { text: string; negative: boolean } {
  const stock = formatQty(product.current_qty, product.unit);
  const negative = product.current_qty < 0;
  if (variant === 'purchase') {
    return { text: `${stock} · Cost ${formatCurrency(product.avg_cost)}`, negative };
  }
  return {
    text: `${stock} · Sell ${formatCurrency(getProductSellPrice(product))}`,
    negative,
  };
}

function buildCategoryOptions(savedNames: string[], products: Product[]): string[] {
  const names = new Set(savedNames.map((name) => name.trim()).filter(Boolean));
  let hasUncategorized = false;
  for (const product of products) {
    const label = categoryLabel(product);
    if (label === 'Uncategorized') {
      hasUncategorized = true;
    } else {
      names.add(label);
    }
  }
  const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
  if (hasUncategorized) sorted.push('Uncategorized');
  return ['All categories', ...sorted];
}

function defaultCategoryFromFilter(filter: string): string {
  if (!filter || filter === 'All categories' || filter === 'Uncategorized') return '';
  return filter;
}

export function ProductPicker({
  label = 'Product',
  products,
  value,
  onChange,
  variant = 'sale',
  onCategoryDeleted,
  onProductCreated,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState<'form' | 'category'>('form');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const selected = products.find((p) => p.id === value);

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('pcs');
  const [newSellPrice, setNewSellPrice] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newOpeningQty, setNewOpeningQty] = useState('0');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const loadSavedCategories = useCallback(async () => {
    try {
      setSavedCategories(await getProductCategories());
    } catch {
      // Keep last known list if refresh fails.
    }
  }, []);

  useEffect(() => {
    void loadSavedCategories();
  }, [loadSavedCategories, products]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const closeAllPickers = useCallback(() => {
    setCategoryOpen(false);
    setProductOpen(false);
  }, []);

  useEffect(() => {
    if (categoryOpen || productOpen) {
      claimDropdownOpen(closeAllPickers);
    } else {
      releaseDropdownOpen(closeAllPickers);
    }
    return () => releaseDropdownOpen(closeAllPickers);
  }, [categoryOpen, productOpen, closeAllPickers]);

  const categories = useMemo(
    () => buildCategoryOptions(savedCategories, products),
    [savedCategories, products]
  );

  const [categoryFilter, setCategoryFilter] = useState('All categories');

  useEffect(() => {
    if (selected) {
      setCategoryFilter(categoryLabel(selected));
    }
  }, [selected?.id, selected]);

  useEffect(() => {
    if (categoryFilter !== 'All categories' && !categories.includes(categoryFilter)) {
      setCategoryFilter('All categories');
    }
  }, [categories, categoryFilter]);

  const filteredProducts = useMemo(() => {
    const pool =
      categoryFilter === 'All categories'
        ? products
        : products.filter((product) => categoryLabel(product) === categoryFilter);
    const q = debouncedSearch.trim().toLowerCase();
    const searched = q
      ? pool.filter(
          (product) =>
            product.name.toLowerCase().includes(q) ||
            (product.sku ?? '').toLowerCase().includes(q) ||
            categoryLabel(product).toLowerCase().includes(q)
        )
      : pool;
    return [...searched].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categoryFilter, debouncedSearch]);

  const resetCreateForm = useCallback(() => {
    setNewName('');
    setNewCategory(defaultCategoryFromFilter(categoryFilter));
    setNewUnit('pcs');
    setNewSellPrice('');
    setNewCost('');
    setNewOpeningQty('0');
    setNewCategoryName('');
    setCreateStep('form');
  }, [categoryFilter]);

  const openCategoryPicker = async () => {
    if (categoryOpen) {
      setCategoryOpen(false);
      return;
    }
    setProductOpen(false);
    setCreating(false);
    await loadSavedCategories();
    setCategoryOpen(true);
  };

  const openProductPicker = () => {
    if (productOpen && !creating) {
      setProductOpen(false);
      return;
    }
    setCategoryOpen(false);
    setSearch('');
    setCreating(false);
    resetCreateForm();
    setProductOpen(true);
  };

  const startCreate = () => {
    resetCreateForm();
    setCreating(true);
    setProductOpen(true);
  };

  const openCreateCategoryStep = async () => {
    setNewCategoryName('');
    await loadSavedCategories();
    setCreateStep('category');
  };

  const handleAddCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      Alert.alert('Missing name', 'Enter a category name.');
      return;
    }
    setAddingCategory(true);
    try {
      await addProductCategory(trimmed);
      await loadSavedCategories();
      setNewCategory(trimmed);
      setNewCategoryName('');
      setCreateStep('form');
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setAddingCategory(false);
    }
  };

  const handleCategoryChange = (cat: string) => {
    setCategoryFilter(cat);
    setCategoryOpen(false);
  };

  const handleDeleteCategory = useCallback(
    (cat: string) => {
      if (cat === 'All categories' || cat === 'Uncategorized') return;
      Alert.alert('Delete category', productCategorySource.deleteMessage(cat), [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProductCategory(cat);
              await loadSavedCategories();
              if (categoryFilter === cat) setCategoryFilter('All categories');
              onCategoryDeleted?.();
            } catch (e) {
              Alert.alert('Error', formatSqliteError(e));
            }
          },
        },
      ]);
    },
    [categoryFilter, loadSavedCategories, onCategoryDeleted]
  );

  const handleCreateProduct = async () => {
    if (saving) return;
    const name = newName.trim();
    if (!name) {
      Alert.alert('Missing name', 'Enter a product name.');
      return;
    }
    if (!newCategory.trim()) {
      Alert.alert('Missing category', 'Select or add a category.');
      return;
    }

    const openingQty = newOpeningQty.trim() ? parseAmountInput(newOpeningQty) : 0;
    const openingCost = newCost.trim() ? parseAmountInput(newCost) : 0;
    const sellPrice = newSellPrice.trim() ? parseAmountInput(newSellPrice) : undefined;

    if (!Number.isFinite(openingQty) || openingQty < 0) {
      Alert.alert('Invalid stock', 'Opening quantity cannot be negative.');
      return;
    }
    if (!Number.isFinite(openingCost) || openingCost < 0) {
      Alert.alert('Invalid cost', 'Cost cannot be negative.');
      return;
    }
    if (sellPrice !== undefined && (!Number.isFinite(sellPrice) || sellPrice < 0)) {
      Alert.alert('Invalid price', 'Enter a valid sell price.');
      return;
    }
    if (variant === 'sale' && sellPrice === undefined && openingCost <= 0) {
      Alert.alert('Sell price needed', 'Enter a sell price for this product.');
      return;
    }

    setSaving(true);
    try {
      const id = await createProduct({
        name,
        category: newCategory.trim(),
        unit: newUnit.trim() || 'pcs',
        opening_qty: openingQty,
        opening_cost: openingCost,
        sell_price: sellPrice,
      });
      await onProductCreated?.(id);
      onChange(id);
      setCategoryFilter(newCategory.trim());
      setCreating(false);
      setProductOpen(false);
    } catch (e) {
      Alert.alert('Could not create product', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const selectProduct = (item: Product) => {
    onChange(item.id);
    setCategoryFilter(categoryLabel(item));
    setProductOpen(false);
    setCreating(false);
  };

  const selectedMeta = selected ? productMeta(selected, variant) : null;

  return (
    <View style={styles.wrap}>
      {categories.length > 1 || products.length > 0 ? (
        <View style={[styles.field, categoryOpen && styles.fieldOpen]}>
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            style={styles.trigger}
            onPress={openCategoryPicker}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Product category"
            accessibilityState={{ expanded: categoryOpen }}
          >
            <Text style={styles.triggerText}>{categoryFilter}</Text>
            <Ionicons
              name={categoryOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
          {categoryOpen ? (
            <View style={styles.panel}>
              <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {categories.map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.option, item === categoryFilter && styles.optionActive]}
                    onPress={() => handleCategoryChange(item)}
                    onLongPress={() => handleDeleteCategory(item)}
                    delayLongPress={400}
                  >
                    <Text style={styles.optionText}>{item}</Text>
                    {item === categoryFilter ? (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.field, productOpen && styles.fieldOpen]}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          style={styles.trigger}
          onPress={openProductPicker}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: productOpen }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.triggerText, !selected && styles.placeholder]}>
              {selected?.name ?? 'Select or create product'}
            </Text>
            {selectedMeta ? (
              <Text style={[styles.meta, selectedMeta.negative && { color: colors.danger }]}>
                {selectedMeta.text}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name={productOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {productOpen && !creating ? (
          <View style={styles.panel}>
            <TouchableOpacity style={styles.createBtn} onPress={startCreate}>
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.createBtnText}>New product</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search products..."
              placeholderTextColor={colors.textMuted}
            />
            <FlatList
              data={filteredProducts}
              style={{ maxHeight: 220 }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.empty}>
                    {products.length === 0
                      ? 'No products yet. Create one above.'
                      : search.trim()
                        ? 'No products match your search.'
                        : 'No products in this category.'}
                  </Text>
                  <TouchableOpacity onPress={startCreate}>
                    <Text style={styles.emptyLink}>Create new product</Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item }) => {
                const meta = productMeta(item, variant);
                return (
                  <TouchableOpacity
                    style={[styles.option, item.id === value && styles.optionActive]}
                    onPress={() => selectProduct(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionText}>{item.name}</Text>
                      <Text style={[styles.meta, meta.negative && { color: colors.danger }]}>
                        {categoryFilter === 'All categories'
                          ? `${categoryLabel(item)} · ${meta.text}`
                          : meta.text}
                      </Text>
                    </View>
                    {item.id === value ? (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
            {saving ? (
              <View style={styles.savingOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        ) : null}

        <Modal
          visible={creating}
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (!saving) setCreating(false);
          }}
        >
          <View style={styles.createModalBackdrop}>
            <View style={styles.createModalCard}>
              {createStep === 'category' ? (
                <>
                  <TouchableOpacity onPress={() => setCreateStep('form')} disabled={addingCategory}>
                    <Text style={styles.backLink}>← Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.panelTitle}>Product Category</Text>
                  <View style={styles.addCategoryRow}>
                    <TextInput
                      style={[styles.search, { flex: 1, marginBottom: 0 }]}
                      value={newCategoryName}
                      onChangeText={setNewCategoryName}
                      placeholder="New category name"
                      placeholderTextColor={colors.textMuted}
                      editable={!addingCategory}
                    />
                    <TouchableOpacity
                      style={styles.addCategoryBtn}
                      onPress={handleAddCreateCategory}
                      disabled={addingCategory}
                    >
                      <Text style={styles.createBtnText}>{addingCategory ? '…' : 'Add'}</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                    {savedCategories.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={[styles.option, item === newCategory && styles.optionActive]}
                        onPress={() => {
                          setNewCategory(item);
                          setCreateStep('form');
                        }}
                      >
                        <Text style={styles.optionText}>{item}</Text>
                        {item === newCategory ? (
                          <Ionicons name="checkmark" size={18} color={colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
                  <TouchableOpacity onPress={() => setCreating(false)} disabled={saving}>
                    <Text style={styles.backLink}>← Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.panelTitle}>New Product</Text>
                  <FormInput label="Product Name" value={newName} onChangeText={setNewName} />
                  <View style={styles.fieldInner}>
                    <Text style={styles.label}>Category</Text>
                    <TouchableOpacity
                      style={styles.trigger}
                      onPress={openCreateCategoryStep}
                      disabled={saving}
                    >
                      <Text style={[styles.triggerText, !newCategory && styles.placeholder]}>
                        {newCategory || 'Select or add category'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <FormInput
                    label="Unit"
                    value={newUnit}
                    onChangeText={setNewUnit}
                    placeholder="pcs, kg, box..."
                  />
                  {variant === 'purchase' ? (
                    <FormInput
                      label="Cost (per unit, optional)"
                      value={newCost}
                      onChangeText={setNewCost}
                      money
                    />
                  ) : (
                    <FormInput
                      label="Sell Price (per unit)"
                      value={newSellPrice}
                      onChangeText={setNewSellPrice}
                      money
                    />
                  )}
                  {variant === 'sale' ? (
                    <FormInput
                      label="Opening Stock (optional)"
                      value={newOpeningQty}
                      onChangeText={setNewOpeningQty}
                      qty
                    />
                  ) : null}
                  {variant === 'sale' ? (
                    <FormInput label="Cost (optional)" value={newCost} onChangeText={setNewCost} money />
                  ) : (
                    <FormInput
                      label="Sell Price (optional)"
                      value={newSellPrice}
                      onChangeText={setNewSellPrice}
                      money
                    />
                  )}
                  <PrimaryButton
                    title={saving ? 'Creating…' : 'Create & Select'}
                    onPress={handleCreateProduct}
                    loading={saving}
                  />
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.sm, gap: spacing.sm },
    field: { gap: 6, zIndex: 1 },
    fieldOpen: { zIndex: 40 },
    fieldInner: { gap: 6, marginBottom: spacing.sm },
    label: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 0,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      minHeight: 44,
      backgroundColor: colors.inputBg,
    },
    triggerText: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
    placeholder: { color: colors.textMuted, fontWeight: '500' },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    panel: {
      ...elevatedSurface(colors, isDark),
      marginTop: 4,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    createModalBackdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end',
    },
    createModalCard: {
      ...elevatedSurface(colors, isDark),
      maxHeight: '88%',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    panelTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    backLink: { color: colors.primary, fontWeight: '600', marginBottom: spacing.xs, fontSize: 14 },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      marginBottom: spacing.xs,
    },
    createBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    addCategoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    addCategoryBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    search: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.inputBg,
      marginBottom: spacing.sm,
    },
    emptyWrap: { paddingVertical: spacing.md, alignItems: 'center', gap: spacing.sm },
    empty: { textAlign: 'center', color: colors.textMuted, fontSize: 13 },
    emptyLink: { color: colors.primary, fontWeight: '700' },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      minHeight: 44,
    },
    optionActive: { backgroundColor: colors.navActive },
    optionText: { fontSize: 14, color: colors.text, fontWeight: '500' },
    savingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.08)',
    },
  });
}

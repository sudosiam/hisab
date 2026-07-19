import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
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

function productMeta(product: Product, variant: 'sale' | 'purchase'): string {
  const stock = formatQty(product.current_qty, product.unit);
  if (variant === 'purchase') {
    return `${stock} · Cost ${formatCurrency(product.avg_cost)}`;
  }
  return `${stock} · Sell ${formatCurrency(getProductSellPrice(product))}`;
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
    const q = search.trim().toLowerCase();
    const searched = q
      ? pool.filter(
          (product) =>
            product.name.toLowerCase().includes(q) ||
            (product.sku ?? '').toLowerCase().includes(q) ||
            categoryLabel(product).toLowerCase().includes(q)
        )
      : pool;
    return [...searched].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categoryFilter, search]);

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
    await loadSavedCategories();
    setCategoryOpen(true);
  };

  const openProductPicker = () => {
    setSearch('');
    setCreating(false);
    resetCreateForm();
    setProductOpen(true);
  };

  const startCreate = () => {
    resetCreateForm();
    setCreating(true);
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
    const openingCost =
      variant === 'purchase'
        ? newCost.trim()
          ? parseAmountInput(newCost)
          : 0
        : newCost.trim()
          ? parseAmountInput(newCost)
          : 0;
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

  const deletableCategories = categories.filter(
    (cat) => cat !== 'All categories' && cat !== 'Uncategorized'
  );

  const selectProduct = (item: Product) => {
    onChange(item.id);
    setCategoryFilter(categoryLabel(item));
    setProductOpen(false);
    setCreating(false);
  };

  return (
    <View style={styles.wrap}>
      {categories.length > 1 || products.length > 0 ? (
        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            style={styles.trigger}
            onPress={openCategoryPicker}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Product category"
            accessibilityHint="Opens category filter"
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
          onPress={openProductPicker}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Opens product selector or create a new product"
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.triggerText, !selected && styles.placeholder]}>
              {selected?.name ?? 'Select or create product'}
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
            {deletableCategories.length > 0 ? (
              <Text style={styles.hint}>Long press a category to delete</Text>
            ) : null}
            <FlatList
              data={categories}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item === categoryFilter && styles.optionActive]}
                  onPress={() => handleCategoryChange(item)}
                  onLongPress={() => handleDeleteCategory(item)}
                  delayLongPress={400}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item === categoryFilter }}
                  accessibilityHint={
                    item !== 'All categories' && item !== 'Uncategorized'
                      ? 'Long press to delete this category'
                      : undefined
                  }
                >
                  <Text style={styles.optionText}>{item}</Text>
                  {item === categoryFilter ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={productOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (creating && createStep === 'category') {
            setCreateStep('form');
            return;
          }
          if (creating) {
            setCreating(false);
            return;
          }
          setProductOpen(false);
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (!saving && !addingCategory) {
              setCreating(false);
              setCreateStep('form');
              setProductOpen(false);
            }
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardWrap}
          >
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              {creating && createStep === 'category' ? (
                <>
                  <View style={styles.createHeader}>
                    <TouchableOpacity
                      onPress={() => setCreateStep('form')}
                      disabled={addingCategory}
                      accessibilityRole="button"
                      accessibilityLabel="Back to product form"
                    >
                      <Text style={styles.backLink}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.sheetTitle}>Product Category</Text>
                  </View>
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
                      accessibilityRole="button"
                      accessibilityLabel="Add category"
                    >
                      <Text style={styles.createBtnText}>{addingCategory ? '…' : 'Add'}</Text>
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    data={savedCategories}
                    keyExtractor={(item) => item}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                      <Text style={styles.empty}>No categories yet. Add one above.</Text>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.option, item === newCategory && styles.optionActive]}
                        onPress={() => {
                          setNewCategory(item);
                          setCreateStep('form');
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: item === newCategory }}
                      >
                        <Text style={styles.optionText}>{item}</Text>
                        {item === newCategory ? (
                          <Ionicons name="checkmark" size={18} color={colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    )}
                  />
                </>
              ) : creating ? (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.createHeader}>
                    <TouchableOpacity
                      onPress={() => setCreating(false)}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel="Back to product list"
                    >
                      <Text style={styles.backLink}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.sheetTitle}>New Product</Text>
                  </View>
                  <Text style={styles.hint}>
                    {variant === 'purchase'
                      ? 'Created here and selected on this purchase line.'
                      : 'Created here and selected on this sale line.'}
                  </Text>
                  <FormInput label="Product Name" value={newName} onChangeText={setNewName} />
                  <View style={styles.field}>
                    <Text style={styles.label}>Category</Text>
                    <TouchableOpacity
                      style={styles.trigger}
                      onPress={openCreateCategoryStep}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel="Select product category"
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
                      placeholder="Usually set on the purchase line"
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
                    <FormInput
                      label="Cost (optional)"
                      value={newCost}
                      onChangeText={setNewCost}
                      money
                      placeholder="Used if sell price left blank"
                    />
                  ) : (
                    <FormInput
                      label="Sell Price (optional)"
                      value={newSellPrice}
                      onChangeText={setNewSellPrice}
                      money
                      placeholder="Defaults to cost + 20%"
                    />
                  )}
                  <PrimaryButton
                    title={saving ? 'Creating…' : 'Create & Select'}
                    onPress={handleCreateProduct}
                    loading={saving}
                  />
                </ScrollView>
              ) : (
                <>
                  <Text style={styles.sheetTitle}>
                    {categoryFilter === 'All categories' ? 'Select Product' : categoryFilter}
                  </Text>
                  <TouchableOpacity
                    style={styles.createBtn}
                    onPress={startCreate}
                    accessibilityRole="button"
                    accessibilityLabel="Create new product"
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    <Text style={styles.createBtnText}>New product</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.search}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search products..."
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="Search products"
                  />
                  <FlatList
                    data={filteredProducts}
                    keyExtractor={(item) => String(item.id)}
                    keyboardShouldPersistTaps="handled"
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
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.option, item.id === value && styles.optionActive]}
                        onPress={() => selectProduct(item)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: item.id === value }}
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
                  {saving ? (
                    <View style={styles.savingOverlay}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : null}
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.sm, gap: spacing.sm },
    field: { gap: 6 },
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
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    keyboardWrap: { width: '100%' },
    sheet: {
      ...cardSurface(colors, isDark),
      maxHeight: '80%',
      padding: spacing.md,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    createHeader: { marginBottom: spacing.xs },
    backLink: { color: colors.primary, fontWeight: '600', marginBottom: spacing.xs, fontSize: 14 },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
    },
    createBtnText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
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
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.inputBg,
      marginBottom: spacing.sm,
    },
    emptyWrap: { paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm },
    empty: { textAlign: 'center', color: colors.textMuted },
    emptyLink: { color: colors.primary, fontWeight: '700' },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    optionActive: { backgroundColor: colors.navActive },
    optionText: { fontSize: 15, color: colors.text, fontWeight: '500' },
    savingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.08)',
    },
  });
}

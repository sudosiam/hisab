import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import {
  adjustStock,
  deleteProduct,
  getProductById,
  getProductMovements,
  getProductSellPrice,
  updateProduct,
} from '../../../src/services/inventory';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { StatCard } from '../../../src/components/StatCard';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { parseRouteId } from '../../../src/utils/route';
import { formatAmountInput, formatCurrency, formatQty, parseAmountInput } from '../../../src/utils/format';
import { roundMoney } from '../../../src/utils/money';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';
import type { InventoryMovement, Product } from '../../../src/types';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        name: { fontSize: 22, fontWeight: '700', color: colors.text },
        meta: { color: colors.textSecondary, marginBottom: spacing.sm },
        kpiRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginVertical: spacing.md,
        },
        moveRow: {
          flexDirection: 'row',
          backgroundColor: colors.surface,
          padding: spacing.sm,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
        },
        moveType: { fontWeight: '600', fontSize: 12, color: colors.primary },
        moveNotes: { fontSize: 12, color: colors.textSecondary },
        moveQty: { fontWeight: '700', color: colors.text },
        neg: { color: colors.danger },
        actions: { marginTop: spacing.lg, gap: spacing.sm },
      }),
    [colors]
  );
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productId = useMemo(() => parseRouteId(id), [id]);

  const load = useCallback(async () => {
    if (!productId) {
      setError('Invalid product');
      setLoading(false);
      return;
    }
    try {
      const [p, m] = await Promise.all([getProductById(productId), getProductMovements(productId)]);
      setProduct(p);
      setMovements(m);
      if (p) {
        setName(p.name);
        setCategory(p.category ?? '');
        setSku(p.sku ?? '');
        setUnit(p.unit);
        setSellPrice(p.sell_price > 0 ? formatAmountInput(p.sell_price) : '');
      }
      setError(p ? null : 'Product not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  const dirtyRef = useRef(false);
  dirtyRef.current = editing || adjustQty.trim().length > 0 || adjustNotes.trim().length > 0;

  const hasLoadedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    // Don't reload over an open edit form or a half-typed adjustment.
    if (dirtyRef.current) return;
    if (!hasLoadedRef.current) setLoading(true);
    load().finally(() => {
      hasLoadedRef.current = true;
    });
  }, [load]));

  const isEditDirty = useMemo(() => {
    if (!product) return false;
    const price = sellPrice.trim() ? parseAmountInput(sellPrice) : 0;
    const editingDirty =
      editing &&
      (name.trim() !== product.name ||
        (category.trim() || '') !== (product.category ?? '') ||
        (sku.trim() || '') !== (product.sku ?? '') ||
        (unit.trim() || 'pcs') !== (product.unit || 'pcs') ||
        price !== (product.sell_price > 0 ? product.sell_price : 0));
    const adjustingDirty = adjustQty.trim().length > 0 || adjustNotes.trim().length > 0;
    return editingDirty || adjustingDirty;
  }, [product, editing, name, category, sku, unit, sellPrice, adjustQty, adjustNotes]);
  useUnsavedChangesGuard(isEditDirty);

  const handleSaveEdit = async () => {
    if (!product || saving) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }
    const price = sellPrice.trim() ? parseAmountInput(sellPrice) : 0;
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Error', 'Enter a valid sell price');
      return;
    }
    setSaving(true);
    try {
      await updateProduct(product.id, {
        name: name.trim(),
        category: category.trim() || null,
        sku: sku.trim() || undefined,
        unit: unit.trim() || 'pcs',
        sell_price: price,
      });
      refresh();
      setEditing(false);
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async () => {
    if (!product || saving) return;
    const qty = parseAmountInput(adjustQty);
    if (!Number.isFinite(qty) || qty === 0) {
      Alert.alert('Error', 'Enter adjustment quantity (+ or -)');
      return;
    }
    setSaving(true);
    try {
      await adjustStock(product.id, qty, adjustNotes.trim() || undefined);
      refresh();
      setAdjustQty('');
      setAdjustNotes('');
      await load();
      Alert.alert('Done', 'Stock adjusted');
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!product) return;
    if (roundMoney(product.current_qty) > 0) {
      Alert.alert(
        'Stock on hand',
        `Adjust stock to zero before deleting "${product.name}".`
      );
      return;
    }
    Alert.alert(
      'Delete Product',
      `Remove "${product.name}" from inventory? Past sales and purchases will not change.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(product.id);
            refresh();
            router.back();
          } catch (e) {
            Alert.alert('Error', formatSqliteError(e));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Product not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stockValue = roundMoney(product.current_qty * product.avg_cost);
  const unitSellPrice = getProductSellPrice(product);
  const marginPct =
    unitSellPrice > 0 ? roundMoney(((unitSellPrice - product.avg_cost) / unitSellPrice) * 100) : 0;

  return (
    <FormScreen>
      {!editing ? (
        <>
          <Text style={localStyles.name}>{product.name}</Text>
          {product.category ? (
            <Text style={localStyles.meta}>{product.category}</Text>
          ) : null}
          {product.sku ? <Text style={localStyles.meta}>SKU: {product.sku}</Text> : null}
        </>
      ) : (
        <>
          <FormInput label="Name" value={name} onChangeText={setName} />
          <CategoryPicker value={category} onChange={setCategory} />
          <FormInput label="SKU" value={sku} onChangeText={setSku} />
          <FormInput label="Unit" value={unit} onChangeText={setUnit} />
          <FormInput label="Sell Price (₹)" value={sellPrice} onChangeText={setSellPrice} money />
          <PrimaryButton title="Save Changes" onPress={handleSaveEdit} loading={saving} />
        </>
      )}

      {!editing ? (
        <View style={localStyles.kpiRow}>
          <StatCard
            label="Stock Value"
            value={stockValue}
            color={colors.primary}
            subtitle={`Avg cost ${formatCurrency(product.avg_cost)}`}
          />
          <StatCard
            label="On Hand"
            displayValue={formatQty(product.current_qty, product.unit)}
            color={colors.accent}
          />
          <StatCard
            label="Sell Price"
            value={unitSellPrice}
            color={colors.success}
            subtitle={marginPct > 0 ? `${marginPct}% margin` : undefined}
          />
        </View>
      ) : null}

      <SectionHeader title="Stock Adjustment" />
      <FormInput
        label="Qty change (+10 or -5)"
        value={adjustQty}
        onChangeText={setAdjustQty}
        qty
        placeholder="+10 or -5"
      />
      <FormInput
        label="Reason (optional)"
        value={adjustNotes}
        onChangeText={setAdjustNotes}
      />
      <PrimaryButton title="Apply Adjustment" onPress={handleAdjust} loading={saving} />

      <SectionHeader title="Movement History" />
      {movements.length === 0 ? (
        <Text style={styles.empty}>No stock movements yet</Text>
      ) : (
        movements.map((m) => (
          <View key={m.id} style={localStyles.moveRow}>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.moveType}>{m.type.toUpperCase()}</Text>
              <Text style={localStyles.moveNotes}>{m.notes ?? ''}</Text>
            </View>
            <Text style={[localStyles.moveQty, m.qty < 0 && localStyles.neg]}>
              {m.qty > 0 ? '+' : ''}{formatQty(m.qty, product.unit)}
            </Text>
          </View>
        ))
      )}

      <View style={localStyles.actions}>
        <PrimaryButton
          title={editing ? 'Cancel Edit' : 'Edit Product'}
          onPress={() => {
            if (editing && product) {
              setName(product.name);
              setCategory(product.category ?? '');
              setSku(product.sku ?? '');
              setUnit(product.unit);
              setSellPrice(product.sell_price > 0 ? formatAmountInput(product.sell_price) : '');
            }
            setEditing(!editing);
          }}
          variant="secondary"
        />
        <PrimaryButton title="Delete Product" onPress={handleDelete} variant="danger" />
      </View>
    </FormScreen>
  );
}

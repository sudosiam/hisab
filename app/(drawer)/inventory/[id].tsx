import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
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
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { formatSqliteError } from '../../../src/db/database';
import { parseRouteId } from '../../../src/utils/route';
import { formatCurrency, formatQty } from '../../../src/utils/format';
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
        meta: { color: colors.textSecondary, marginBottom: spacing.md },
        stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md },
        stat: {
          backgroundColor: colors.surface,
          padding: spacing.md,
          borderRadius: radius.md,
          minWidth: '45%',
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
        },
        statLabel: { fontSize: 11, color: colors.textSecondary },
        statValue: { fontSize: 15, fontWeight: '600', marginTop: 4, color: colors.text },
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
        setSku(p.sku ?? '');
        setUnit(p.unit);
        setSellPrice(p.sell_price > 0 ? String(p.sell_price) : '');
      }
      setError(p ? null : 'Product not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const handleSaveEdit = async () => {
    if (!product || !name.trim()) return;
    setSaving(true);
    try {
      await updateProduct(product.id, {
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit: unit.trim() || 'pcs',
        sell_price: parseFloat(sellPrice) || 0,
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
    if (!product) return;
    const qty = parseFloat(adjustQty);
    if (!qty) {
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
    Alert.alert('Delete Product', `Delete "${product.name}"?`, [
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!editing ? (
        <>
          <Text style={localStyles.name}>{product.name}</Text>
          {product.sku ? <Text style={localStyles.meta}>SKU: {product.sku}</Text> : null}
        </>
      ) : (
        <>
          <FormInput label="Name" value={name} onChangeText={setName} />
          <FormInput label="SKU" value={sku} onChangeText={setSku} />
          <FormInput label="Unit" value={unit} onChangeText={setUnit} />
          <FormInput
            label="Sell Price (₹)"
            value={sellPrice}
            onChangeText={setSellPrice}
            keyboardType="decimal-pad"
          />
          <PrimaryButton title="Save Changes" onPress={handleSaveEdit} loading={saving} />
        </>
      )}

      <View style={localStyles.stats}>
        <View style={localStyles.stat}>
          <Text style={localStyles.statLabel}>Current Stock</Text>
          <Text style={localStyles.statValue}>{formatQty(product.current_qty, product.unit)}</Text>
        </View>
        <View style={localStyles.stat}>
          <Text style={localStyles.statLabel}>Weighted Avg Cost</Text>
          <Text style={localStyles.statValue}>{formatCurrency(product.avg_cost)}</Text>
        </View>
        <View style={localStyles.stat}>
          <Text style={localStyles.statLabel}>Sell Price</Text>
          <Text style={[localStyles.statValue, { color: colors.success }]}>
            {formatCurrency(getProductSellPrice(product))}
          </Text>
        </View>
        <View style={localStyles.stat}>
          <Text style={localStyles.statLabel}>Stock Value</Text>
          <Text style={localStyles.statValue}>{formatCurrency(product.current_qty * product.avg_cost)}</Text>
        </View>
      </View>

      <SectionHeader title="Stock Adjustment" />
      <FormInput
        label="Qty change (+10 or -5)"
        value={adjustQty}
        onChangeText={setAdjustQty}
        keyboardType="decimal-pad"
      />
      <FormInput
        label="Reason (optional)"
        value={adjustNotes}
        onChangeText={setAdjustNotes}
      />
      <PrimaryButton title="Apply Adjustment" onPress={handleAdjust} loading={saving} />

      <SectionHeader title="Movement History" />
      {movements.map((m) => (
        <View key={m.id} style={localStyles.moveRow}>
          <View style={{ flex: 1 }}>
            <Text style={localStyles.moveType}>{m.type.toUpperCase()}</Text>
            <Text style={localStyles.moveNotes}>{m.notes ?? ''}</Text>
          </View>
          <Text style={[localStyles.moveQty, m.qty < 0 && localStyles.neg]}>
            {m.qty > 0 ? '+' : ''}{formatQty(m.qty, product.unit)}
          </Text>
        </View>
      ))}

      <View style={localStyles.actions}>
        <PrimaryButton title={editing ? 'Cancel Edit' : 'Edit Product'} onPress={() => setEditing(!editing)} variant="secondary" />
        <PrimaryButton title="Delete Product" onPress={handleDelete} variant="danger" />
      </View>
    </ScrollView>
  );
}

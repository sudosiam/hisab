import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { ProductPicker } from '../../../src/components/ProductPicker';
import { getProducts } from '../../../src/services/inventory';
import { getPurchaseById, getPurchaseItems, updatePurchase } from '../../../src/services/purchases';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, formatQtyInput, parseAmountInput } from '../../../src/utils/format';
import { isValidISODate } from '../../../src/utils/date';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Product, Purchase } from '../../../src/types';

interface LineItem {
  key: string;
  product_id: number;
  qty: string;
  unit_cost: string;
}

let lineItemCounter = 0;
function createEmptyLineItem(): LineItem {
  lineItemCounter += 1;
  return {
    key: `purchase-edit-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_cost: '',
  };
}

export default function EditPurchaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        itemCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        itemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
        qtyField: { flex: 1 },
        costField: { flex: 1.2 },
        removeBtn: { padding: spacing.sm, marginBottom: spacing.md },
        removeText: { color: colors.danger, fontSize: 18 },
        totals: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginVertical: spacing.sm,
          gap: spacing.xs,
        },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
        totalLabel: { fontSize: 14, color: colors.textSecondary },
        totalValue: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
          fontVariant: ['tabular-nums'],
        },
        grandTotal: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.primary,
          fontVariant: ['tabular-nums'],
        },
        hint: { color: colors.warning },
        paidHint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
      }),
    [colors, isDark]
  );

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedSnapshotRef = useRef<string | null>(null);

  const purchaseId = React.useMemo(() => {
    const raw = Array.isArray(id) ? id[0] : id;
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [id]);

  const load = useCallback(async () => {
    if (!purchaseId) {
      setError('Invalid purchase');
      setLoading(false);
      return;
    }
    try {
      const [p, purchaseItems, productList] = await Promise.all([
        getPurchaseById(purchaseId),
        getPurchaseItems(purchaseId),
        getProducts(),
      ]);
      if (p) {
        const preDiscountFactor =
          p.total_amount > 0 ? p.subtotal / p.total_amount : 1;
        setPurchase(p);
        setSupplierName(p.supplier_name);
        setInvoiceNo(p.invoice_no);
        setVendorInvoiceNo(p.vendor_invoice_no ?? '');
        setDate(p.date);
        setNotes(p.notes ?? '');
        setProducts(productList);
        setItems(
          purchaseItems.length > 0
            ? purchaseItems.map((item) => ({
                key: `purchase-item-${item.id}`,
                product_id: item.product_id,
                qty: formatQtyInput(item.qty),
                unit_cost: formatAmountInput(item.unit_cost * preDiscountFactor),
              }))
            : productList.length > 0
              ? [createEmptyLineItem()]
              : []
        );
        savedSnapshotRef.current = JSON.stringify({
          supplierName: p.supplier_name,
          invoiceNo: p.invoice_no,
          vendorInvoiceNo: p.vendor_invoice_no ?? '',
          date: p.date,
          notes: p.notes ?? '',
          items:
            purchaseItems.length > 0
              ? purchaseItems.map((item) => ({
                  product_id: item.product_id,
                  qty: formatQtyInput(item.qty),
                  unit_cost: formatAmountInput(item.unit_cost * preDiscountFactor),
                }))
              : [],
        });
        setError(null);
      } else {
        setError('Purchase not found');
      }
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  const loadedForRef = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (loadedForRef.current === purchaseId) return;
      loadedForRef.current = purchaseId;
      load();
    }, [load, purchaseId])
  );

  const reloadProducts = useCallback(async () => {
    try {
      setProducts(await getProducts());
      refresh();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [refresh]);

  const discountAmount = purchase?.discount_amount ?? 0;
  const subtotal = items.reduce(
    (sum, item) => sum + (parseAmountInput(item.qty) || 0) * (parseAmountInput(item.unit_cost) || 0),
    0
  );
  const total = Math.max(0, subtotal - discountAmount);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        supplierName,
        invoiceNo,
        vendorInvoiceNo,
        date,
        notes,
        items: items.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          unit_cost: item.unit_cost,
        })),
      }),
    [supplierName, invoiceNo, vendorInvoiceNo, date, notes, items]
  );
  const isDirty =
    savedSnapshotRef.current !== null && formSnapshot !== savedSnapshotRef.current;
  useUnsavedChangesGuard(isDirty);

  const addItem = () => {
    if (products.length === 0) return;
    setItems([...items, createEmptyLineItem()]);
  };

  const updateItem = (index: number, field: 'product_id' | 'qty' | 'unit_cost', value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!purchase || saving) return;
    if (!supplierName.trim()) {
      Alert.alert('Error', 'Supplier name is required');
      return;
    }
    if (!invoiceNo.trim()) {
      Alert.alert('Error', 'Purchase number is required');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Error', 'Add at least one item');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid purchase date');
      return;
    }
    if (discountAmount > subtotal + 0.01) {
      Alert.alert(
        'Discount too high for new subtotal',
        `This purchase has a ${formatCurrency(discountAmount)} discount built into item costs. The new subtotal is only ${formatCurrency(subtotal)}. Add line items, or delete this purchase and create a new one to change the discount.`
      );
      return;
    }
    if (total + 0.01 < purchase.paid_amount) {
      Alert.alert(
        'Error',
        `New total (${formatCurrency(total)}) cannot be less than the amount already paid (${formatCurrency(purchase.paid_amount)}). Remove payments first.`
      );
      return;
    }

    for (const item of items) {
      if (!item.product_id) {
        Alert.alert('Error', 'Select a product for each line item');
        return;
      }
      const qty = parseAmountInput(item.qty);
      const unitCost = parseAmountInput(item.unit_cost);
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('Error', 'Each item must have quantity greater than zero');
        return;
      }
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        Alert.alert('Error', 'Each item must have unit cost greater than zero');
        return;
      }
    }

    setSaving(true);
    try {
      await saveWithDuplicateInvoiceWarning(
        'purchases',
        invoiceNo,
        async () => {
          await updatePurchase(purchase.id, {
            supplier_name: supplierName,
            invoice_no: invoiceNo.trim(),
            vendor_invoice_no: vendorInvoiceNo.trim() || undefined,
            date,
            discount_amount: purchase.discount_amount ?? 0,
            notes: notes.trim() || undefined,
            items: items.map((item) => ({
              product_id: item.product_id,
              qty: parseAmountInput(item.qty) || 0,
              unit_cost: parseAmountInput(item.unit_cost) || 0,
            })),
          });
          refresh();
          savedSnapshotRef.current = formSnapshot;
          router.back();
        },
        purchase.id
      );
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !purchase) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Purchase not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FormScreen>
      {purchase.paid_amount > 0 ? (
        <Text style={localStyles.paidHint}>
          Paid so far: {formatCurrency(purchase.paid_amount)} — new total must not go below this.
        </Text>
      ) : null}
      <CustomerAutocomplete
        value={supplierName}
        onChange={setSupplierName}
        partyType="vendor"
        label="Supplier"
        placeholder="Supplier name"
      />
      <FormInput
        label="Purchase Number"
        value={invoiceNo}
        onChangeText={setInvoiceNo}
        autoCapitalize="characters"
      />
      <FormInput
        label="Vendor Invoice No (optional)"
        value={vendorInvoiceNo}
        onChangeText={setVendorInvoiceNo}
      />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />

      <View style={styles.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionHeader title="Line Items" />
          <TouchableOpacity onPress={addItem}>
            <Text style={styles.link}>+ Add Item</Text>
          </TouchableOpacity>
        </View>

        {products.length === 0 ? (
          <Text style={localStyles.hint}>Add products in Inventory first.</Text>
        ) : (
          items.map((item, index) => (
            <View key={item.key} style={localStyles.itemCard}>
              <ProductPicker
                products={products}
                value={item.product_id}
                onChange={(productId) => updateItem(index, 'product_id', productId)}
                variant="purchase"
                onCategoryDeleted={reloadProducts}
              />
              <View style={localStyles.itemRow}>
                <View style={localStyles.qtyField}>
                  <FormInput
                    label="Qty"
                    value={item.qty}
                    onChangeText={(v) => updateItem(index, 'qty', v)}
                    qty
                  />
                </View>
                <View style={localStyles.costField}>
                  <FormInput
                    label="Unit Cost (₹)"
                    value={item.unit_cost}
                    onChangeText={(v) => updateItem(index, 'unit_cost', v)}
                    money
                  />
                </View>
                <TouchableOpacity
                  onPress={() => removeItem(index)}
                  style={localStyles.removeBtn}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Remove line item"
                >
                  <Text style={localStyles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={localStyles.totals}>
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Subtotal</Text>
            <Text style={localStyles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Discount (fixed)</Text>
            <Text style={localStyles.totalValue}>{formatCurrency(discountAmount)}</Text>
          </View>
          <Text style={styles.cardSub}>
            Discount is built into inventory costs and stays unchanged when editing items.
          </Text>
          <View style={[localStyles.totalRow, { marginTop: spacing.sm }]}>
            <Text style={localStyles.totalLabel}>Grand Total</Text>
            <Text style={localStyles.grandTotal}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </View>

      <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
    </FormScreen>
  );
}

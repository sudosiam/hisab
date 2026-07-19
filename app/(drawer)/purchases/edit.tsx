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
import { getPartyByName } from '../../../src/services/parties';
import { getBusinessState, isGstEnabled, isTaxInclusivePricing } from '../../../src/services/appSettings';
import { computeGstDocument } from '../../../src/services/gst';
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
  gst_rate: string;
  hsn_sac: string;
}

let lineItemCounter = 0;
function createEmptyLineItem(): LineItem {
  lineItemCounter += 1;
  return {
    key: `purchase-edit-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_cost: '',
    gst_rate: '',
    hsn_sac: '',
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
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.sm,
        },
        itemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
        qtyField: { flex: 1 },
        costField: { flex: 1.2 },
        removeBtn: { padding: spacing.sm, marginBottom: spacing.md },
        removeText: { color: colors.danger, fontSize: 18 },
        totals: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
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
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;
  const [businessState, setBusinessState] = useState('');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [partyState, setPartyState] = useState<string | null>(null);

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
        // Reverse discount on taxable (ex-GST) amounts — never divide by tax-inclusive totals.
        const discountAmt = p.discount_amount ?? 0;
        const taxableBase = Math.max(0, p.subtotal - discountAmt);
        const grossFactor = taxableBase > 0.009 ? p.subtotal / taxableBase : 1;
        const inclusiveNow = await isTaxInclusivePricing();
        setPurchase(p);
        setSupplierName(p.supplier_name);
        setInvoiceNo(p.invoice_no);
        setVendorInvoiceNo(p.vendor_invoice_no ?? '');
        setDate(p.date);
        setNotes(p.notes ?? '');
        setProducts(productList);
        productsRef.current = productList;
        const mappedItems =
          purchaseItems.length > 0
            ? purchaseItems.map((item) => {
                const taxable = item.taxable_amount ?? item.total;
                const rate = item.gst_rate ?? 0;
                const preDiscountEx = taxable * grossFactor;
                let enteredUnit = item.qty > 0 ? preDiscountEx / item.qty : item.unit_cost;
                if (inclusiveNow && rate > 0) {
                  enteredUnit = enteredUnit * (1 + rate / 100);
                }
                return {
                  key: `purchase-item-${item.id}`,
                  product_id: item.product_id,
                  qty: formatQtyInput(item.qty),
                  unit_cost: formatAmountInput(enteredUnit),
                  gst_rate: rate > 0 ? formatAmountInput(rate) : '',
                  hsn_sac: item.hsn_sac ?? '',
                };
              })
            : productList.length > 0
              ? [createEmptyLineItem()]
              : [];
        setItems(mappedItems);
        getPartyByName(p.supplier_name, 'vendor')
          .then((party) => setPartyState(party?.state ?? null))
          .catch(() => {});
        savedSnapshotRef.current = JSON.stringify({
          supplierName: p.supplier_name,
          invoiceNo: p.invoice_no,
          vendorInvoiceNo: p.vendor_invoice_no ?? '',
          date: p.date,
          notes: p.notes ?? '',
          items: mappedItems.map((item) => ({
            product_id: item.product_id,
            qty: item.qty,
            unit_cost: item.unit_cost,
            gst_rate: item.gst_rate,
            hsn_sac: item.hsn_sac,
          })),
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

  const reloadProducts = useCallback(async () => {
    try {
      const p = await getProducts();
      productsRef.current = p;
      setProducts(p);
      return p;
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
      return productsRef.current;
    }
  }, []);

  const loadedForRef = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (loadedForRef.current !== purchaseId) {
        loadedForRef.current = purchaseId;
        load();
        return;
      }
      void reloadProducts();
    }, [load, purchaseId, reloadProducts])
  );

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getBusinessState(), isGstEnabled(), isTaxInclusivePricing()])
      .then(([state, enabled, inclusive]) => {
        if (!cancelled) {
          setBusinessState(state);
          setGstEnabled(enabled);
          setTaxInclusive(inclusive);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const name = supplierName.trim();
    if (!name) {
      setPartyState(null);
      return;
    }
    getPartyByName(name, 'vendor')
      .then((party) => {
        if (!cancelled) setPartyState(party?.state ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supplierName]);

  const discountAmount = purchase?.discount_amount ?? 0;

  const gstDoc = useMemo(() => {
    try {
      return computeGstDocument({
        lines: items.map((item) => ({
          qty: parseAmountInput(item.qty) || 0,
          unit_price: parseAmountInput(item.unit_cost) || 0,
          gst_rate: parseAmountInput(item.gst_rate) || 0,
          hsn_sac: item.hsn_sac.trim() || null,
        })),
        discount_amount: discountAmount,
        business_state: businessState || null,
        party_state: partyState,
        gst_enabled: gstEnabled,
        tax_inclusive: taxInclusive,
      });
    } catch {
      return null;
    }
  }, [items, discountAmount, businessState, partyState, gstEnabled, taxInclusive]);

  const subtotal = gstDoc?.subtotal ?? 0;
  const total = gstDoc?.total_amount ?? 0;

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
          gst_rate: item.gst_rate,
          hsn_sac: item.hsn_sac,
        })),
      }),
    [supplierName, invoiceNo, vendorInvoiceNo, date, notes, items]
  );
  const isDirty =
    savedSnapshotRef.current !== null && formSnapshot !== savedSnapshotRef.current;
  useUnsavedChangesGuard(isDirty);

  const addItem = () => {
    setItems([...items, createEmptyLineItem()]);
  };

  const updateItem = (
    index: number,
    field: 'product_id' | 'qty' | 'unit_cost' | 'gst_rate' | 'hsn_sac',
    value: string | number
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = productsRef.current.find((p) => p.id === value);
      if (product) {
        updated[index].unit_cost = formatAmountInput(product.avg_cost);
        updated[index].gst_rate =
          (product.gst_rate ?? 0) > 0 ? formatAmountInput(product.gst_rate ?? 0) : '';
        updated[index].hsn_sac = product.hsn_sac ?? '';
      }
    }
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
              gst_rate: parseAmountInput(item.gst_rate) || 0,
              hsn_sac: item.hsn_sac.trim() || null,
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

        {items.map((item, index) => (
            <View key={item.key} style={localStyles.itemCard}>
              <ProductPicker
                products={products}
                value={item.product_id}
                onChange={(productId) => updateItem(index, 'product_id', productId)}
                variant="purchase"
                onCategoryDeleted={reloadProducts}
                onProductCreated={async () => {
                  await reloadProducts();
                }}
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
              <View style={localStyles.itemRow}>
                <View style={localStyles.qtyField}>
                  <FormInput
                    label="HSN/SAC"
                    value={item.hsn_sac}
                    onChangeText={(v) => updateItem(index, 'hsn_sac', v)}
                    placeholder="Optional"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={localStyles.costField}>
                  <FormInput
                    label="GST %"
                    value={item.gst_rate}
                    onChangeText={(v) => updateItem(index, 'gst_rate', v)}
                    money
                    placeholder="0"
                  />
                </View>
              </View>
            </View>
          ))}

        <View style={localStyles.totals}>
          {gstEnabled ? (
            <Text style={[localStyles.totalLabel, localStyles.hint, { marginBottom: spacing.xs }]}>
              {taxInclusive ? 'Prices are tax-inclusive' : 'Prices are tax-exclusive'}
            </Text>
          ) : null}
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
          {gstEnabled && gstDoc && gstDoc.tax_amount > 0.009 ? (
            <>
              <View style={localStyles.totalRow}>
                <Text style={localStyles.totalLabel}>Taxable</Text>
                <Text style={localStyles.totalValue}>{formatCurrency(gstDoc.taxable_amount)}</Text>
              </View>
              {gstDoc.is_inter_state ? (
                <View style={localStyles.totalRow}>
                  <Text style={localStyles.totalLabel}>IGST</Text>
                  <Text style={localStyles.totalValue}>{formatCurrency(gstDoc.igst_amount)}</Text>
                </View>
              ) : (
                <>
                  <View style={localStyles.totalRow}>
                    <Text style={localStyles.totalLabel}>CGST</Text>
                    <Text style={localStyles.totalValue}>{formatCurrency(gstDoc.cgst_amount)}</Text>
                  </View>
                  <View style={localStyles.totalRow}>
                    <Text style={localStyles.totalLabel}>SGST</Text>
                    <Text style={localStyles.totalValue}>{formatCurrency(gstDoc.sgst_amount)}</Text>
                  </View>
                </>
              )}
            </>
          ) : null}
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

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
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { getSaleById, getSaleItems, updateSale } from '../../../src/services/sales';
import { getPartyByName } from '../../../src/services/parties';
import { getNextSaleDocumentNo } from '../../../src/services/invoiceNumbers';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, formatQtyInput, parseAmountInput } from '../../../src/utils/format';
import { isValidISODate } from '../../../src/utils/date';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { spacing, radius } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Product, Sale, SaleInvoiceType } from '../../../src/types';

interface LineItem {
  key: string;
  product_id: number;
  qty: string;
  unit_price: string;
}

let lineItemCounter = 0;
function createEmptyLineItem(): LineItem {
  lineItemCounter += 1;
  return {
    key: `sale-edit-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_price: '',
  };
}

export default function EditSaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        typeChip: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          backgroundColor: colors.surface,
        },
        typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        typeChipText: { fontWeight: '600', color: colors.text },
        typeChipTextActive: { color: colors.onPrimary },
        itemCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        itemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
        qtyField: { flex: 1 },
        priceField: { flex: 1.2 },
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

  const [sale, setSale] = useState<Sale | null>(null);
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceType, setInvoiceType] = useState<SaleInvoiceType>('invoice');
  const [date, setDate] = useState('');
  const [discount, setDiscount] = useState('0');
  const [serviceCharges, setServiceCharges] = useState('');
  const [notes, setNotes] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedSnapshotRef = useRef<string | null>(null);
  const originalQtyByProductRef = useRef<Map<number, number>>(new Map());

  const saleId = React.useMemo(() => {
    const raw = Array.isArray(id) ? id[0] : id;
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [id]);

  const load = useCallback(async () => {
    if (!saleId) {
      setError('Invalid sale');
      setLoading(false);
      return;
    }
    try {
      const [s, saleItems, productList] = await Promise.all([
        getSaleById(saleId),
        getSaleItems(saleId),
        getProducts(),
      ]);
      if (s) {
        setSale(s);
        setPartyName(s.party_name);
        getPartyByName(s.party_name, 'customer')
          .then((party) => {
            if (party?.phone) setPartyPhone(party.phone);
          })
          .catch(() => {});
        setInvoiceNo(s.invoice_no);
        setInvoiceType(s.invoice_type === 'bos' ? 'bos' : 'invoice');
        setDate(s.date);
        setDiscount(formatAmountInput(s.discount_amount ?? 0));
        setServiceCharges(s.service_charges > 0 ? formatAmountInput(s.service_charges) : '');
        setNotes(s.notes ?? '');
        setProducts(productList);
        setItems(
          saleItems.length > 0
            ? saleItems.map((item) => ({
                key: `sale-item-${item.id}`,
                product_id: item.product_id,
                qty: formatQtyInput(item.qty),
                unit_price: formatAmountInput(item.unit_price),
              }))
            : productList.length > 0
              ? [createEmptyLineItem()]
              : []
        );
        const originalQty = new Map<number, number>();
        for (const item of saleItems) {
          originalQty.set(item.product_id, (originalQty.get(item.product_id) ?? 0) + item.qty);
        }
        originalQtyByProductRef.current = originalQty;
        savedSnapshotRef.current = JSON.stringify({
          partyName: s.party_name,
          partyPhone,
          invoiceNo: s.invoice_no,
          invoiceType: s.invoice_type === 'bos' ? 'bos' : 'invoice',
          date: s.date,
          discount: formatAmountInput(s.discount_amount ?? 0),
          serviceCharges: s.service_charges > 0 ? formatAmountInput(s.service_charges) : '',
          notes: s.notes ?? '',
          items:
            saleItems.length > 0
              ? saleItems.map((item) => ({
                  product_id: item.product_id,
                  qty: formatQtyInput(item.qty),
                  unit_price: formatAmountInput(item.unit_price),
                }))
              : [],
        });
        setError(null);
      } else {
        setError('Sale not found');
      }
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  const loadedForRef = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (loadedForRef.current === saleId) return;
      loadedForRef.current = saleId;
      load();
    }, [load, saleId])
  );

  const reloadProducts = useCallback(async () => {
    try {
      setProducts(await getProducts());
      refresh();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [refresh]);

  const subtotal = items.reduce(
    (sum, item) => sum + (parseAmountInput(item.qty) || 0) * (parseAmountInput(item.unit_price) || 0),
    0
  );
  const discountAmount = Math.max(0, parseAmountInput(discount) || 0);
  const serviceChargesAmount = Math.max(0, parseAmountInput(serviceCharges) || 0);
  const total = Math.max(0, subtotal - discountAmount + serviceChargesAmount);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        partyName,
        partyPhone,
        invoiceNo,
        invoiceType,
        date,
        discount,
        serviceCharges,
        notes,
        items: items.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          unit_price: item.unit_price,
        })),
      }),
    [partyName, partyPhone, invoiceNo, invoiceType, date, discount, serviceCharges, notes, items]
  );
  const isDirty =
    savedSnapshotRef.current !== null && formSnapshot !== savedSnapshotRef.current;
  useUnsavedChangesGuard(isDirty);

  const addItem = () => {
    if (products.length === 0) return;
    setItems([...items, createEmptyLineItem()]);
  };

  const updateItem = (index: number, field: 'product_id' | 'qty' | 'unit_price', value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index].unit_price = formatAmountInput(getProductSellPrice(product));
      }
    }
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!sale || saving) return;
    if (!partyName.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }
    if (!invoiceNo.trim()) {
      Alert.alert('Error', 'Invoice number is required');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Error', 'Add at least one item');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid invoice date');
      return;
    }
    if (discountAmount > subtotal) {
      Alert.alert('Error', 'Discount cannot exceed subtotal');
      return;
    }
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      Alert.alert('Error', 'Enter a valid discount amount');
      return;
    }
    if (!Number.isFinite(serviceChargesAmount) || serviceChargesAmount < 0) {
      Alert.alert('Error', 'Enter a valid service charge amount');
      return;
    }
    if (total + 0.01 < sale.paid_amount) {
      Alert.alert(
        'Error',
        `New total (${formatCurrency(total)}) cannot be less than the amount already paid (${formatCurrency(sale.paid_amount)}). Remove payments first.`
      );
      return;
    }

    for (const item of items) {
      if (!item.product_id) {
        Alert.alert('Error', 'Select a product for each line item');
        return;
      }
      const qty = parseAmountInput(item.qty);
      const unitPrice = parseAmountInput(item.unit_price);
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('Error', 'Each item must have quantity greater than zero');
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        Alert.alert('Error', 'Each item must have unit price greater than zero');
        return;
      }
    }

    const qtyByProduct = new Map<number, number>();
    for (const item of items) {
      const qty = parseAmountInput(item.qty);
      if (item.product_id && qty > 0) {
        qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + qty);
      }
    }
    for (const [productId, qty] of qtyByProduct) {
      const product = products.find((p) => p.id === productId);
      const originalQty = originalQtyByProductRef.current.get(productId) ?? 0;
      const available = (product?.current_qty ?? 0) + originalQty;
      if (product && available < qty) {
        Alert.alert(
          'Insufficient stock',
          `${product.name} has only ${available} in stock (need ${qty}).`
        );
        return;
      }
    }

    setSaving(true);
    try {
      await saveWithDuplicateInvoiceWarning(
        'sales',
        invoiceNo,
        async () => {
          await updateSale(sale.id, {
            party_name: partyName,
            party_phone: partyPhone.trim() || undefined,
            invoice_no: invoiceNo.trim(),
            invoice_type: invoiceType,
            date,
            discount_amount: discountAmount,
            service_charges: serviceChargesAmount,
            notes: notes.trim() || undefined,
            items: items.map((item) => ({
              product_id: item.product_id,
              qty: parseAmountInput(item.qty) || 0,
              unit_price: parseAmountInput(item.unit_price) || 0,
            })),
          });
          refresh();
          savedSnapshotRef.current = formSnapshot;
          router.back();
        },
        sale.id
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

  if (error || !sale) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Sale not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FormScreen>
      {sale.paid_amount > 0 ? (
        <Text style={localStyles.paidHint}>
          Paid so far: {formatCurrency(sale.paid_amount)} — new total must not go below this.
        </Text>
      ) : null}
      <CustomerAutocomplete value={partyName} onChange={setPartyName} />
      <FormInput
        label="Phone (optional)"
        value={partyPhone}
        onChangeText={setPartyPhone}
        keyboardType="phone-pad"
      />
      <View style={localStyles.typeRow}>
        {([
          { value: 'invoice', label: 'Invoice' },
          { value: 'bos', label: 'Bill of Supply' },
        ] as { value: SaleInvoiceType; label: string }[]).map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              localStyles.typeChip,
              invoiceType === option.value && localStyles.typeChipActive,
            ]}
            onPress={() => {
              if (option.value === invoiceType) return;
              setInvoiceType(option.value);
              getNextSaleDocumentNo(option.value)
                .then(setInvoiceNo)
                .catch(() => {});
            }}
          >
            <Text
              style={[
                localStyles.typeChipText,
                invoiceType === option.value && localStyles.typeChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FormInput
        label={invoiceType === 'bos' ? 'BOS Number' : 'Invoice Number'}
        value={invoiceNo}
        onChangeText={setInvoiceNo}
        autoCapitalize="characters"
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
                <View style={localStyles.priceField}>
                  <FormInput
                    label="Unit Price (₹)"
                    value={item.unit_price}
                    onChangeText={(v) => updateItem(index, 'unit_price', v)}
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
          <FormInput
            label="Total Discount (₹)"
            value={discount}
            onChangeText={setDiscount}
            money
          />
          <FormInput
            label="Service Charges (₹, optional)"
            value={serviceCharges}
            onChangeText={setServiceCharges}
            money
          />
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

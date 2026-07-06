import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { ProductPicker } from '../../../src/components/ProductPicker';
import { PaymentSplitForm, PaymentRow } from '../../../src/components/PaymentSplitForm';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { getProducts } from '../../../src/services/inventory';
import { getPaymentAccounts } from '../../../src/services/banking';
import { createPurchase } from '../../../src/services/purchases';
import { getNextPurchaseInvoiceNo } from '../../../src/services/invoiceNumbers';
import { DRAFT_KEYS, loadDraft, type PurchaseFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency } from '../../../src/utils/format';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Product } from '../../../src/types';

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
    key: `purchase-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_cost: '',
  };
}

function isPurchaseDraftEmpty(d: PurchaseFormDraft): boolean {
  const hasText =
    d.supplierName.trim() ||
    d.vendorInvoiceNo.trim() ||
    d.notes.trim() ||
    (parseFloat(d.discount) || 0) > 0 ||
    d.payments.length > 0;
  if (hasText) return false;
  if (d.items.length === 0) return true;
  if (d.items.length === 1) {
    const item = d.items[0];
    return !item.product_id && item.qty === '1' && !item.unit_cost.trim();
  }
  return false;
}

export default function NewPurchaseScreen() {
  const router = useRouter();
  const { supplierName: supplierNameParam } = useLocalSearchParams<{ supplierName?: string }>();
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
        totalValue: { fontSize: 14, fontWeight: '600', color: colors.text },
        grandTotal: { fontSize: 18, fontWeight: '700', color: colors.primary },
        hint: { color: colors.warning },
      }),
    [colors, isDark]
  );

  const [supplierName, setSupplierName] = useState(
    () => (typeof supplierNameParam === 'string' ? decodeURIComponent(supplierNameParam) : '')
  );
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const draftPayload = useMemo<PurchaseFormDraft>(
    () => ({
      supplierName,
      invoiceNo,
      date,
      vendorInvoiceNo,
      notes,
      discount,
      items,
      payments,
    }),
    [supplierName, invoiceNo, date, vendorInvoiceNo, notes, discount, items, payments]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.purchaseNew,
    draftPayload,
    { isEmpty: isPurchaseDraftEmpty }
  );

  const resetForm = async (productList: Product[]) => {
    setSupplierName('');
    setInvoiceNo(await getNextPurchaseInvoiceNo());
    setDate(todayISO());
    setVendorInvoiceNo('');
    setNotes('');
    setDiscount('0');
    setPayments([]);
    if (productList.length > 0) {
      setItems([createEmptyLineItem()]);
    } else {
      setItems([]);
    }
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved purchase will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          await resetForm(products);
        },
      },
    ]);
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, a] = await Promise.all([getProducts(), getPaymentAccounts()]);
        if (cancelled) return;
        setProducts(p);
        setAccounts(a);
        const draft = await loadDraft<PurchaseFormDraft>(DRAFT_KEYS.purchaseNew);
        const nextInvoice = await getNextPurchaseInvoiceNo();
        if (cancelled) return;
        if (draft && !isPurchaseDraftEmpty(draft)) {
          setSupplierName(draft.supplierName || '');
          setInvoiceNo(draft.invoiceNo || nextInvoice);
          setDate(isValidISODate(draft.date) ? draft.date : todayISO());
          setVendorInvoiceNo(draft.vendorInvoiceNo || '');
          setNotes(draft.notes || '');
          setDiscount(Number.isFinite(parseFloat(draft.discount)) ? draft.discount : '0');
          const validItems = (draft.items ?? []).filter(
            (i) => !i.product_id || p.some((prod) => prod.id === i.product_id)
          );
          setItems(validItems.length ? validItems : p.length > 0 ? [createEmptyLineItem()] : []);
          setPayments(draft.payments || []);
          noteDraftLoaded();
        } else if (typeof supplierNameParam === 'string' && supplierNameParam) {
          setSupplierName(decodeURIComponent(supplierNameParam));
          setInvoiceNo(nextInvoice);
          if (p.length > 0) setItems([createEmptyLineItem()]);
        } else {
          setInvoiceNo(nextInvoice);
          if (p.length > 0) setItems([createEmptyLineItem()]);
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      } finally {
        if (!cancelled) markReady();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markReady, noteDraftLoaded, supplierNameParam]);

  const subtotal = items.reduce(
    (sum, item) => sum + (parseFloat(item.qty) || 0) * (parseFloat(item.unit_cost) || 0),
    0
  );
  const discountAmount = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(0, subtotal - discountAmount);

  const addItem = () => {
    if (products.length === 0) return;
    setItems([...items, createEmptyLineItem()]);
  };

  const updateItem = (index: number, field: 'product_id' | 'qty' | 'unit_cost', value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index].unit_cost = formatAmountInput(product.avg_cost);
      }
    }
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (loading) return;
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
    if (discountAmount > subtotal) {
      Alert.alert('Error', 'Discount cannot exceed subtotal');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Error', 'Enter a valid date as YYYY-MM-DD');
      return;
    }
    for (const p of payments) {
      if (parseFloat(p.amount) > 0 && !isValidISODate(p.date)) {
        Alert.alert('Error', 'Enter a valid payment date as YYYY-MM-DD');
        return;
      }
    }
    for (const item of items) {
      if (!item.product_id) {
        Alert.alert('Error', 'Select a product for each line item');
        return;
      }
      const qty = parseFloat(item.qty);
      const cost = parseFloat(item.unit_cost);
      if (!qty || qty <= 0) {
        Alert.alert('Error', 'Each item must have quantity greater than zero');
        return;
      }
      if (!cost || cost <= 0) {
        Alert.alert('Error', 'Each item must have unit cost greater than zero');
        return;
      }
    }

    setLoading(true);
    try {
      const id = await createPurchase({
        supplier_name: supplierName.trim(),
        invoice_no: invoiceNo.trim(),
        date,
        vendor_invoice_no: vendorInvoiceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        discount_amount: discountAmount,
        items: items.map((i) => ({
          product_id: i.product_id,
          qty: parseFloat(i.qty) || 0,
          unit_cost: parseFloat(i.unit_cost) || 0,
        })),
        payments: payments
          .filter((p) => parseFloat(p.amount) > 0 && p.account_id > 0)
          .map((p) => ({
            account_id: p.account_id,
            amount: parseFloat(p.amount),
            date: p.date,
            notes: p.notes || undefined,
          })),
      });
      await clearDraftOnSave();
      refresh();
      router.replace(`/(drawer)/purchases/${id}`);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen>
      <DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />
      <FormInput
        label="Purchase No"
        value={invoiceNo}
        onChangeText={setInvoiceNo}
        placeholder="Auto-generated"
      />
      <CustomerAutocomplete
        label="Supplier"
        partyType="vendor"
        value={supplierName}
        onChange={setSupplierName}
        placeholder="Start typing vendor name"
      />
      <FormInput label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <FormInput
        label="Vendor Invoice No (optional)"
        value={vendorInvoiceNo}
        onChangeText={setVendorInvoiceNo}
        placeholder="Supplier bill / invoice number"
      />
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
                onChange={(id) => updateItem(index, 'product_id', id)}
                variant="purchase"
              />
              <View style={localStyles.itemRow}>
                <View style={localStyles.qtyField}>
                  <FormInput
                    label="Qty"
                    value={item.qty}
                    onChangeText={(v) => updateItem(index, 'qty', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={localStyles.costField}>
                  <FormInput
                    label="Unit Cost (₹)"
                    value={item.unit_cost}
                    onChangeText={(v) => updateItem(index, 'unit_cost', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => removeItem(index)}
                  style={localStyles.removeBtn}
                  accessibilityLabel="Remove item"
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
            keyboardType="decimal-pad"
          />
          <View style={[localStyles.totalRow, { marginTop: spacing.sm }]}>
            <Text style={localStyles.totalLabel}>Grand Total</Text>
            <Text style={localStyles.grandTotal}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </View>

      <SectionHeader title="Payment" />
      <PaymentSplitForm
        accounts={accounts}
        payments={payments}
        onChange={setPayments}
        totalDue={total}
        defaultDate={isValidISODate(date) ? date : undefined}
      />

      <PrimaryButton title="Save Purchase" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

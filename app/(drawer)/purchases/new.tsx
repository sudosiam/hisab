import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
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
import { PaymentSplitForm, PaymentRow } from '../../../src/components/PaymentSplitForm';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { getProducts } from '../../../src/services/inventory';
import { getPaymentAccounts } from '../../../src/services/banking';
import { createPurchase } from '../../../src/services/purchases';
import { getNextPurchaseInvoiceNo } from '../../../src/services/invoiceNumbers';
import { getPartyByName } from '../../../src/services/parties';
import { getBusinessState, isGstEnabled, isTaxInclusivePricing } from '../../../src/services/appSettings';
import { computeGstDocument } from '../../../src/services/gst';
import { DRAFT_KEYS, loadDraft, type PurchaseFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../../../src/utils/format';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { addMoney, roundMoney } from '../../../src/utils/money';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Product } from '../../../src/types';

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
    key: `purchase-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_cost: '',
    gst_rate: '',
    hsn_sac: '',
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
  if (
    d.items.some(
      (item) =>
        item.product_id > 0 ||
        item.unit_cost.trim() ||
        item.qty !== '1' ||
        (item.gst_rate ?? '').trim() ||
        (item.hsn_sac ?? '').trim()
    )
  ) {
    return false;
  }
  return true;
}

export default function NewPurchaseScreen() {
  const router = useRouter();
  const { supplierName: supplierNameParam } = useLocalSearchParams<{ supplierName?: string }>();
  const { refresh, refreshKey } = useDatabase();
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
  const [items, setItems] = useState<LineItem[]>(() => [createEmptyLineItem()]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [businessState, setBusinessState] = useState('');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [partyState, setPartyState] = useState<string | null>(null);
  const productsRef = React.useRef<Product[]>([]);
  productsRef.current = products;

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

  const resetForm = async () => {
    setSupplierName('');
    setInvoiceNo(await getNextPurchaseInvoiceNo());
    setDate(todayISO());
    setVendorInvoiceNo('');
    setNotes('');
    setDiscount('0');
    setPayments([]);
    setItems([createEmptyLineItem()]);
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved purchase will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          await resetForm();
        },
      },
    ]);
  };

  const reloadProducts = React.useCallback(async () => {
    try {
      const [p, a] = await Promise.all([getProducts(), getPaymentAccounts()]);
      productsRef.current = p;
      setProducts(p);
      setAccounts(a);
      return p;
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
      return productsRef.current;
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void reloadProducts();
    }, [reloadProducts, refreshKey])
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, a] = await Promise.all([getProducts(), getPaymentAccounts()]);
        if (cancelled) return;
        setProducts(p);
        productsRef.current = p;
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
          setItems(
            validItems.length
              ? validItems.map((i) => ({
                  key: i.key || `purchase-item-${Date.now()}-${++lineItemCounter}`,
                  product_id: i.product_id,
                  qty: i.qty || '1',
                  unit_cost: i.unit_cost || '',
                  gst_rate: i.gst_rate ?? '',
                  hsn_sac: i.hsn_sac ?? '',
                }))
              : [createEmptyLineItem()]
          );
          setPayments(draft.payments || []);
          noteDraftLoaded();
          const paramSupplier =
            typeof supplierNameParam === 'string' && supplierNameParam
              ? decodeURIComponent(supplierNameParam)
              : '';
          if (paramSupplier) setSupplierName(paramSupplier);
        } else if (typeof supplierNameParam === 'string' && supplierNameParam) {
          setSupplierName(decodeURIComponent(supplierNameParam));
          setInvoiceNo(nextInvoice);
          setItems([createEmptyLineItem()]);
        } else {
          setInvoiceNo(nextInvoice);
          setItems([createEmptyLineItem()]);
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

  const discountAmount = roundMoney(Math.max(0, parseAmountInput(discount) || 0));

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

  const paidTotal = useMemo(
    () => payments.reduce((sum, p) => addMoney(sum, parseAmountInput(p.amount) || 0), 0),
    [payments]
  );
  const isOverpaid = paidTotal > total + 0.01;

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
      Alert.alert('Invalid date', 'Select a valid purchase date');
      return;
    }
    for (const p of payments) {
      const amt = parseAmountInput(p.amount);
      if (p.amount.trim() && (!Number.isFinite(amt) || amt <= 0)) {
        Alert.alert('Error', 'Each payment amount must be greater than zero (or leave it empty)');
        return;
      }
      if (amt > 0 && !p.account_id) {
        Alert.alert('Error', 'Select an account for each payment amount');
        return;
      }
      if (amt > 0 && !isValidISODate(p.date)) {
        Alert.alert('Invalid payment date', 'Select a valid payment date');
        return;
      }
    }
    const paidTotal = payments.reduce((sum, p) => addMoney(sum, parseAmountInput(p.amount) || 0), 0);
    if (paidTotal > total + 0.01) {
      Alert.alert('Payment too high', `Total payments cannot exceed purchase amount (${formatCurrency(total)}).`);
      return;
    }
    for (const item of items) {
      if (!item.product_id) {
        Alert.alert('Error', 'Select a product for each line item');
        return;
      }
      const qty = parseAmountInput(item.qty);
      const cost = parseAmountInput(item.unit_cost);
      if (!qty || qty <= 0) {
        Alert.alert('Error', 'Each item must have quantity greater than zero');
        return;
      }
      if (!cost || cost <= 0) {
        Alert.alert('Error', 'Each item must have unit cost greater than zero');
        return;
      }
    }

    const performSave = async () => {
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
            qty: parseAmountInput(i.qty) || 0,
            unit_cost: parseAmountInput(i.unit_cost) || 0,
            gst_rate: parseAmountInput(i.gst_rate) || 0,
            hsn_sac: i.hsn_sac.trim() || null,
          })),
          payments: payments
            .filter((p) => parseAmountInput(p.amount) > 0 && p.account_id > 0)
            .map((p) => ({
              account_id: p.account_id,
              amount: parseAmountInput(p.amount),
              date: p.date,
              notes: p.notes || undefined,
            })),
        });
        await clearDraftOnSave();
        refresh();
        router.replace(`/(drawer)/purchases/${id}`);
      } catch (e) {
        Alert.alert('Error', formatSqliteError(e));
      }
    };

    // Lock the button before the async duplicate-invoice check, or a fast
    // double-tap can save the same purchase twice.
    setLoading(true);
    try {
      await saveWithDuplicateInvoiceWarning('purchases', invoiceNo.trim(), performSave);
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
      <DatePickerField label="Date" value={date} onChange={setDate} />
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

        {items.map((item, index) => (
            <View key={item.key} style={localStyles.itemCard}>
              <ProductPicker
                products={products}
                value={item.product_id}
                onChange={(id) => updateItem(index, 'product_id', id)}
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
          <FormInput label="Total Discount (₹)" value={discount} onChangeText={setDiscount} money />
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

      <SectionHeader title="Payment" />
      <PaymentSplitForm
        accounts={accounts}
        payments={payments}
        onChange={setPayments}
        totalDue={total}
        defaultDate={isValidISODate(date) ? date : undefined}
        mode="pay"
      />

      <PrimaryButton
        title="Save Purchase"
        onPress={handleSave}
        loading={loading}
        disabled={isOverpaid}
      />
    </FormScreen>
  );
}

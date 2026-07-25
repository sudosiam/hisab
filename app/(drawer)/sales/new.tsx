import React, { useDeferredValue, useMemo, useState } from 'react';
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
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { getSelectableAccounts } from '../../../src/services/banking';
import { createSale } from '../../../src/services/sales';
import { getPartyByName } from '../../../src/services/parties';
import { getNextSaleDocumentNo } from '../../../src/services/invoiceNumbers';
import { getBusinessState, isGstEnabled, isTaxInclusivePricing } from '../../../src/services/appSettings';
import { computeGstDocument } from '../../../src/services/gst';
import { DRAFT_KEYS, loadDraft, type SaleFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../../../src/utils/format';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { addMoney, roundMoney } from '../../../src/utils/money';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { radius, spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Product, SaleInvoiceType } from '../../../src/types';

interface LineItem {
  key: string;
  product_id: number;
  qty: string;
  unit_price: string;
  gst_rate: string;
  hsn_sac: string;
}

let lineItemCounter = 0;
function createEmptyLineItem(): LineItem {
  lineItemCounter += 1;
  return {
    key: `sale-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_price: '',
    gst_rate: '',
    hsn_sac: '',
  };
}

function isSaleDraftEmpty(d: SaleFormDraft): boolean {
  const hasText =
    d.partyName.trim() ||
    d.partyPhone.trim() ||
    d.notes.trim() ||
    d.serviceCharges.trim() ||
    (parseFloat(d.discount) || 0) > 0 ||
    d.payments.length > 0;
  if (hasText) return false;
  if (d.items.length === 0) return true;
  if (
    d.items.some(
      (item) =>
        item.product_id > 0 ||
        item.unit_price.trim() ||
        item.qty !== '1' ||
        (item.gst_rate ?? '').trim() ||
        (item.hsn_sac ?? '').trim()
    )
  ) {
    return false;
  }
  return true;
}

export default function NewSaleScreen() {
  const router = useRouter();
  const { partyName: partyNameParam } = useLocalSearchParams<{ partyName?: string }>();
  const { refresh, refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        headerStrip: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
          gap: spacing.sm,
        },
        typeRow: { flexDirection: 'row', gap: spacing.xs },
        typeChip: {
          flex: 1,
          paddingVertical: 8,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          backgroundColor: colors.surface,
        },
        typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        typeChipText: { fontWeight: '600', color: colors.text, fontSize: 13 },
        typeChipTextActive: { color: colors.onPrimary },
        headerMeta: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
        headerMetaGrow: { flex: 1.2 },
        headerMetaDate: { flex: 1 },
        partyBlock: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
          gap: 2,
        },
        itemCard: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
        },
        itemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
        qtyField: { flex: 0.85 },
        priceField: { flex: 1.1 },
        gstField: { flex: 0.75 },
        removeBtn: { padding: spacing.sm, marginBottom: spacing.md },
        removeText: { color: colors.danger, fontSize: 16 },
        hsnToggle: { marginTop: 2, marginBottom: spacing.xs },
        hsnToggleText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
        totals: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          marginVertical: spacing.sm,
          gap: 4,
        },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        totalLabel: { fontSize: 13, color: colors.textSecondary },
        totalValue: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.text,
          fontVariant: ['tabular-nums'],
        },
        grandTotal: {
          fontSize: 17,
          fontWeight: '700',
          color: colors.primary,
          fontVariant: ['tabular-nums'],
        },
        paidHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
        hint: { color: colors.warning },
        discountRow: { flexDirection: 'row', gap: spacing.sm },
        discountField: { flex: 1 },
        addItemBtn: {
          marginTop: spacing.xs,
          marginBottom: spacing.sm,
          minHeight: 52,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: colors.primary,
          borderStyle: 'dashed',
          backgroundColor: colors.primaryContainer,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing.md,
        },
        addItemBtnText: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.primary,
        },
      }),
    [colors, isDark]
  );
  const [showHsnByLine, setShowHsnByLine] = useState<Record<string, boolean>>({});

  const [partyName, setPartyName] = useState(
    () => (typeof partyNameParam === 'string' ? decodeURIComponent(partyNameParam) : '')
  );
  const [partyPhone, setPartyPhone] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceType, setInvoiceType] = useState<SaleInvoiceType>('invoice');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [serviceCharges, setServiceCharges] = useState('');
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

  const draftPayload = useMemo<SaleFormDraft>(
    () => ({
      partyName,
      partyPhone,
      invoiceNo,
      invoiceType,
      date,
      notes,
      discount,
      serviceCharges,
      items,
      payments,
    }),
    [
      partyName,
      partyPhone,
      invoiceNo,
      invoiceType,
      date,
      notes,
      discount,
      serviceCharges,
      items,
      payments,
    ]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.saleNew,
    draftPayload,
    { isEmpty: isSaleDraftEmpty }
  );

  const resetForm = async (_productList: Product[]) => {
    setPartyName('');
    setPartyPhone('');
    setInvoiceType('invoice');
    setInvoiceNo(await getNextSaleDocumentNo('invoice'));
    setDate(todayISO());
    setNotes('');
    setDiscount('0');
    setServiceCharges('');
    setPayments([]);
    setItems([createEmptyLineItem()]);
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved sale will be cleared.', [
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

  const reloadProducts = React.useCallback(async () => {
    try {
      const [p, a] = await Promise.all([getProducts(), getSelectableAccounts()]);
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
      void refreshKey;
      void reloadProducts();
    }, [reloadProducts, refreshKey])
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, a] = await Promise.all([getProducts(), getSelectableAccounts()]);
        if (cancelled) return;
        setProducts(p);
        productsRef.current = p;
        setAccounts(a);
        const draft = await loadDraft<SaleFormDraft>(DRAFT_KEYS.saleNew);
        const draftType: SaleInvoiceType = draft?.invoiceType === 'bos' ? 'bos' : 'invoice';
        const nextInvoice = await getNextSaleDocumentNo(draftType);
        if (cancelled) return;
        if (draft && !isSaleDraftEmpty(draft)) {
          setPartyName(draft.partyName || '');
          setPartyPhone(draft.partyPhone || '');
          setInvoiceNo(draft.invoiceNo || nextInvoice);
          setInvoiceType(draftType);
          setDate(isValidISODate(draft.date) ? draft.date : todayISO());
          setNotes(draft.notes || '');
          setDiscount(Number.isFinite(parseFloat(draft.discount)) ? draft.discount : '0');
          setServiceCharges(draft.serviceCharges || '');
          const validItems = (draft.items ?? []).filter(
            (i) => !i.product_id || p.some((prod) => prod.id === i.product_id)
          );
          setItems(
            validItems.length
              ? (() => {
                  const seen = new Set<string>();
                  return validItems.map((i) => {
                    let key = i.key || `sale-item-${Date.now()}-${++lineItemCounter}`;
                    while (seen.has(key)) {
                      key = `sale-item-${Date.now()}-${++lineItemCounter}`;
                    }
                    seen.add(key);
                    return {
                      key,
                      product_id: i.product_id,
                      qty: i.qty || '1',
                      unit_price: i.unit_price || '',
                      gst_rate: i.gst_rate ?? '',
                      hsn_sac: i.hsn_sac ?? '',
                    };
                  });
                })()
              : [createEmptyLineItem()]
          );
          setPayments(draft.payments || []);
          noteDraftLoaded();
          const paramParty =
            typeof partyNameParam === 'string' && partyNameParam
              ? decodeURIComponent(partyNameParam)
              : '';
          if (paramParty) setPartyName(paramParty);
        } else if (typeof partyNameParam === 'string' && partyNameParam) {
          setPartyName(decodeURIComponent(partyNameParam));
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
  }, [markReady, noteDraftLoaded, partyNameParam]);

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
    const name = partyName.trim();
    if (!name) {
      setPartyState(null);
      return;
    }
    getPartyByName(name, 'customer')
      .then((party) => {
        if (!cancelled && party) {
          setPartyPhone((current) => (current.trim() ? current : party.phone ?? ''));
          setPartyState(party.state ?? null);
        } else if (!cancelled) {
          setPartyState(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partyName]);

  const discountAmount = roundMoney(Math.max(0, parseAmountInput(discount) || 0));
  const serviceChargesAmount = roundMoney(Math.max(0, parseAmountInput(serviceCharges) || 0));
  const deferredItems = useDeferredValue(items);
  const deferredDiscount = useDeferredValue(discountAmount);
  const deferredServiceCharges = useDeferredValue(serviceChargesAmount);

  const gstDoc = useMemo(() => {
    try {
      return computeGstDocument({
        lines: deferredItems.map((item) => ({
          qty: parseAmountInput(item.qty) || 0,
          unit_price: parseAmountInput(item.unit_price) || 0,
          gst_rate: parseAmountInput(item.gst_rate) || 0,
          hsn_sac: item.hsn_sac.trim() || null,
        })),
        discount_amount: deferredDiscount,
        service_charges: deferredServiceCharges,
        business_state: businessState || null,
        party_state: partyState,
        gst_enabled: gstEnabled,
        tax_inclusive: taxInclusive,
      });
    } catch {
      return null;
    }
  }, [
    deferredItems,
    deferredDiscount,
    deferredServiceCharges,
    businessState,
    partyState,
    gstEnabled,
    taxInclusive,
  ]);

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
    field: 'product_id' | 'qty' | 'unit_price' | 'gst_rate' | 'hsn_sac',
    value: string | number
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = productsRef.current.find((p) => p.id === value);
      if (product) {
        updated[index].unit_price = formatAmountInput(getProductSellPrice(product));
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
    if (discountAmount > subtotal) {
      Alert.alert('Error', 'Discount cannot exceed subtotal');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid invoice date');
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
      Alert.alert('Payment too high', `Total payments cannot exceed invoice amount (${formatCurrency(total)}).`);
      return;
    }
    // Aggregate quantities per product so split lines are validated together.
    for (const item of items) {
      if (!item.product_id) {
        Alert.alert('Error', 'Select a product for each line item');
        return;
      }
      const qty = parseAmountInput(item.qty);
      const price = parseAmountInput(item.unit_price);
      if (!qty || qty <= 0) {
        Alert.alert('Error', 'Each item must have quantity greater than zero');
        return;
      }
      if (!price || price <= 0) {
        Alert.alert('Error', 'Each item must have unit price greater than zero');
        return;
      }
    }
    const performSave = async () => {
      try {
        const saleId = await createSale({
          party_name: partyName.trim(),
          party_phone: partyPhone.trim() || undefined,
          invoice_no: invoiceNo.trim(),
          invoice_type: invoiceType,
          date,
          notes: notes.trim() || undefined,
          discount_amount: discountAmount,
          service_charges: serviceChargesAmount > 0 ? serviceChargesAmount : undefined,
          items: items.map((i) => ({
            product_id: i.product_id,
            qty: parseAmountInput(i.qty) || 0,
            unit_price: parseAmountInput(i.unit_price) || 0,
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
        router.replace(`/(drawer)/sales/${saleId}`);
      } catch (e) {
        Alert.alert('Error', formatSqliteError(e));
      }
    };

    // Lock the button before the async duplicate-invoice check, or a fast
    // double-tap can save the same invoice twice.
    setLoading(true);
    try {
      await saveWithDuplicateInvoiceWarning('sales', invoiceNo.trim(), performSave);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen>
      <DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />

      <View style={localStyles.headerStrip}>
        <View style={localStyles.typeRow}>
          {(
            [
              { value: 'invoice', label: 'Tax Invoice' },
              { value: 'bos', label: 'Bill of Supply' },
            ] as { value: SaleInvoiceType; label: string }[]
          ).map((option) => (
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
        <View style={localStyles.headerMeta}>
          <View style={localStyles.headerMetaGrow}>
            <FormInput
              label={invoiceType === 'bos' ? 'BOS No' : 'Invoice No'}
              value={invoiceNo}
              onChangeText={setInvoiceNo}
              placeholder="Auto"
            />
          </View>
          <View style={localStyles.headerMetaDate}>
            <DatePickerField label="Date" value={date} onChange={setDate} />
          </View>
        </View>
      </View>

      <View style={localStyles.partyBlock}>
        <CustomerAutocomplete value={partyName} onChange={setPartyName} />
        <FormInput
          label="Phone"
          value={partyPhone}
          onChangeText={setPartyPhone}
          keyboardType="phone-pad"
          placeholder="Mobile"
        />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Items" />

        {items.map((item, index) => {
          const showHsn = showHsnByLine[item.key] || !!item.hsn_sac.trim();
          return (
            <View key={item.key} style={localStyles.itemCard}>
              <ProductPicker
                products={products}
                value={item.product_id}
                onChange={(id) => updateItem(index, 'product_id', id)}
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
                <View style={localStyles.priceField}>
                  <FormInput
                    label="Rate"
                    value={item.unit_price}
                    onChangeText={(v) => updateItem(index, 'unit_price', v)}
                    money
                  />
                </View>
                <View style={localStyles.gstField}>
                  <FormInput
                    label="GST%"
                    value={item.gst_rate}
                    onChangeText={(v) => updateItem(index, 'gst_rate', v)}
                    money
                    placeholder="0"
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
              {!showHsn ? (
                <TouchableOpacity
                  style={localStyles.hsnToggle}
                  onPress={() =>
                    setShowHsnByLine((prev) => ({ ...prev, [item.key]: true }))
                  }
                >
                  <Text style={localStyles.hsnToggleText}>+ HSN/SAC</Text>
                </TouchableOpacity>
              ) : (
                <FormInput
                  label="HSN/SAC"
                  value={item.hsn_sac}
                  onChangeText={(v) => updateItem(index, 'hsn_sac', v)}
                  placeholder="Optional"
                  keyboardType="number-pad"
                />
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={localStyles.addItemBtn}
          onPress={addItem}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add item"
        >
          <Text style={localStyles.addItemBtnText}>+ Add Item</Text>
        </TouchableOpacity>

        <View style={localStyles.totals}>
          {gstEnabled ? (
            <Text style={[localStyles.totalLabel, localStyles.hint]}>
              {taxInclusive ? 'Tax-inclusive prices' : 'Tax-exclusive prices'}
            </Text>
          ) : null}
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Subtotal</Text>
            <Text style={localStyles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={localStyles.discountRow}>
            <View style={localStyles.discountField}>
              <FormInput label="Discount" value={discount} onChangeText={setDiscount} money />
            </View>
            <View style={localStyles.discountField}>
              <FormInput
                label="Service"
                value={serviceCharges}
                onChangeText={setServiceCharges}
                money
              />
            </View>
          </View>
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
          <View style={[localStyles.totalRow, { marginTop: 4 }]}>
            <Text style={localStyles.totalLabel}>Total</Text>
            <Text style={localStyles.grandTotal}>{formatCurrency(total)}</Text>
          </View>
          <Text style={localStyles.paidHint}>Paid {formatCurrency(paidTotal)}</Text>
        </View>
      </View>

      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />

      <SectionHeader title="Payment" />
      <PaymentSplitForm
        accounts={accounts}
        payments={payments}
        onChange={setPayments}
        totalDue={total}
        defaultDate={isValidISODate(date) ? date : undefined}
      />

      <PrimaryButton
        title="Save Sale"
        onPress={handleSave}
        loading={loading}
        disabled={isOverpaid}
      />
    </FormScreen>
  );
}

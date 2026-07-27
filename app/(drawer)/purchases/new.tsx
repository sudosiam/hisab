import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  useScreenStyles,
  ICON,
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
import {
  applyPartyAdvanceToPurchase,
  getPartyUnallocatedPaymentCredit,
} from '../../../src/services/paymentVouchers';
import { computeUntaxedDocument } from '../../../src/services/documentTotals';
import { DRAFT_KEYS, loadDraft, type PurchaseFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { useDatabaseActions, useRefreshKey } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../../../src/utils/format';
import { MoneyText } from '../../../src/components/MoneyText';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { addMoney, roundMoney } from '../../../src/utils/money';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { spacing, typography } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Product } from '../../../src/types';

interface LineItem {
  key: string;
  product_id: number;
  qty: string;
  unit_cost: string;
  hsn_sac: string;
}

type FieldErrors = {
  partyName?: string;
  invoiceNo?: string;
  date?: string;
  discount?: string;
  items?: string;
  payments?: string;
};

let lineItemCounter = 0;
function createEmptyLineItem(): LineItem {
  lineItemCounter += 1;
  return {
    key: `purchase-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_cost: '',
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
  const { refresh } = useDatabaseActions();
  const refreshKey = useRefreshKey();
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
        removeBtn: { padding: spacing.sm, marginBottom: spacing.md, alignItems: 'center', justifyContent: 'center' },
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
        fieldError: {
          ...typography.caption,
          color: colors.danger,
          marginTop: spacing.xs,
        },
        itemsError: {
          ...typography.caption,
          color: colors.danger,
          marginBottom: spacing.sm,
        },
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [advanceCredit, setAdvanceCredit] = useState(0);
  const [applyAdvance, setApplyAdvance] = useState(false);
  const productsRef = React.useRef<Product[]>([]);
  productsRef.current = products;
  const leaveBypassRef = useRef(false);
  const skipAdvanceAutoRef = useRef(false);

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
      applyAdvance,
    }),
    [supplierName, invoiceNo, date, vendorInvoiceNo, notes, discount, items, payments, applyAdvance]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.purchaseNew,
    draftPayload,
    { isEmpty: isPurchaseDraftEmpty }
  );

  useUnsavedChangesGuard(!isPurchaseDraftEmpty(draftPayload) || hasDraft, {
    bypassRef: leaveBypassRef,
    message: 'You have an unsaved purchase draft that will be lost.',
  });

  const resetForm = async () => {
    setSupplierName('');
    setInvoiceNo(await getNextPurchaseInvoiceNo());
    setDate(todayISO());
    setVendorInvoiceNo('');
    setNotes('');
    setDiscount('0');
    setPayments([]);
    setApplyAdvance(false);
    setAdvanceCredit(0);
    setItems([createEmptyLineItem()]);
    setFieldErrors({});
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
      void refreshKey;
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
              ? (() => {
                  const seen = new Set<string>();
                  return validItems.map((i) => {
                    let key = i.key || `purchase-item-${Date.now()}-${++lineItemCounter}`;
                    while (seen.has(key)) {
                      key = `purchase-item-${Date.now()}-${++lineItemCounter}`;
                    }
                    seen.add(key);
                    return {
                      key,
                      product_id: i.product_id,
                      qty: i.qty || '1',
                      unit_cost: i.unit_cost || '',
                      hsn_sac: i.hsn_sac ?? '',
                    };
                  });
                })()
              : [createEmptyLineItem()]
          );
          setPayments(draft.payments || []);
          if (typeof draft.applyAdvance === 'boolean') {
            skipAdvanceAutoRef.current = true;
            setApplyAdvance(draft.applyAdvance);
          }
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
    const name = supplierName.trim();
    if (!name) {
      setAdvanceCredit(0);
      setApplyAdvance(false);
      skipAdvanceAutoRef.current = false;
      return;
    }
    getPartyByName(name, 'vendor')
      .then(async () => {
        const credit = await getPartyUnallocatedPaymentCredit(name, 'vendor');
        if (!cancelled) {
          setAdvanceCredit(credit);
          if (skipAdvanceAutoRef.current) {
            skipAdvanceAutoRef.current = false;
            if (credit <= 0.009) setApplyAdvance(false);
          } else {
            setApplyAdvance(credit > 0.009);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAdvanceCredit(0);
          setApplyAdvance(false);
          skipAdvanceAutoRef.current = false;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supplierName]);

  const discountAmount = roundMoney(Math.max(0, parseAmountInput(discount) || 0));
  const deferredItems = useDeferredValue(items);
  const deferredDiscount = useDeferredValue(discountAmount);

  const docTotals = useMemo(() => {
    try {
      return computeUntaxedDocument({
        lines: deferredItems.map((item) => ({
          qty: parseAmountInput(item.qty) || 0,
          unit_price: parseAmountInput(item.unit_cost) || 0,
          hsn_sac: item.hsn_sac.trim() || null,
        })),
        discount_amount: deferredDiscount,
      });
    } catch {
      return null;
    }
  }, [deferredItems, deferredDiscount]);

  const subtotal = docTotals?.subtotal ?? 0;
  const total = docTotals?.total_amount ?? 0;

  const cashPaidTotal = useMemo(
    () => payments.reduce((sum, p) => addMoney(sum, parseAmountInput(p.amount) || 0), 0),
    [payments]
  );
  const advanceAppliedPreview =
    applyAdvance && advanceCredit > 0.009
      ? roundMoney(Math.min(advanceCredit, Math.max(0, total - cashPaidTotal)))
      : 0;
  const paidTotal = addMoney(cashPaidTotal, advanceAppliedPreview);
  const isOverpaid = paidTotal > total + 0.01;

  const addItem = () => {
    setItems([...items, createEmptyLineItem()]);
    if (fieldErrors.items) setFieldErrors((e) => ({ ...e, items: undefined }));
  };

  const updateItem = (
    index: number,
    field: 'product_id' | 'qty' | 'unit_cost' | 'hsn_sac',
    value: string | number
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = productsRef.current.find((p) => p.id === value);
      if (product) {
        updated[index].unit_cost = formatAmountInput(product.avg_cost);
        updated[index].hsn_sac = product.hsn_sac ?? '';
      }
    }
    setItems(updated);
    if (fieldErrors.items) setFieldErrors((e) => ({ ...e, items: undefined }));
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
    if (fieldErrors.items) setFieldErrors((e) => ({ ...e, items: undefined }));
  };

  const handleSave = async () => {
    if (loading) return;

    const nextErrors: FieldErrors = {};
    if (!supplierName.trim()) nextErrors.partyName = 'Supplier name is required';
    if (!invoiceNo.trim()) nextErrors.invoiceNo = 'Purchase number is required';
    if (!isValidISODate(date)) nextErrors.date = 'Select a valid purchase date';
    if (items.length === 0) {
      nextErrors.items = 'Add at least one item';
    } else {
      for (const item of items) {
        if (!item.product_id) {
          nextErrors.items = 'Select a product for each line item';
          break;
        }
        const qty = parseAmountInput(item.qty);
        const cost = parseAmountInput(item.unit_cost);
        if (!qty || qty <= 0) {
          nextErrors.items = 'Each item must have quantity greater than zero';
          break;
        }
        if (!cost || cost <= 0) {
          nextErrors.items = 'Each item must have unit cost greater than zero';
          break;
        }
      }
    }
    if (discountAmount > subtotal) nextErrors.discount = 'Discount cannot exceed subtotal';

    for (const p of payments) {
      const amt = parseAmountInput(p.amount);
      if (p.amount.trim() && (!Number.isFinite(amt) || amt <= 0)) {
        nextErrors.payments =
          'Each payment amount must be greater than zero (or leave it empty)';
        break;
      }
      if (amt > 0 && !p.account_id) {
        nextErrors.payments = 'Select an account for each payment amount';
        break;
      }
      if (amt > 0 && !isValidISODate(p.date)) {
        nextErrors.payments = 'Select a valid payment date';
        break;
      }
    }

    const cashPaid = payments.reduce((sum, p) => addMoney(sum, parseAmountInput(p.amount) || 0), 0);
    const advanceToApply =
      applyAdvance && advanceCredit > 0.009
        ? roundMoney(Math.min(advanceCredit, Math.max(0, total - cashPaid)))
        : 0;
    const paidTotal = addMoney(cashPaid, advanceToApply);
    if (paidTotal > total + 0.01) {
      nextErrors.payments = `Total payments cannot exceed purchase amount (${formatCurrency(total)}).`;
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

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
        if (advanceToApply > 0.009) {
          await applyPartyAdvanceToPurchase(id, advanceToApply, date);
        }
        leaveBypassRef.current = true;
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
        onChangeText={(v) => {
          setInvoiceNo(v);
          if (fieldErrors.invoiceNo) setFieldErrors((e) => ({ ...e, invoiceNo: undefined }));
        }}
        placeholder="Auto-generated"
        error={fieldErrors.invoiceNo}
      />
      <CustomerAutocomplete
        label="Supplier"
        partyType="vendor"
        value={supplierName}
        onChange={(v) => {
          setSupplierName(v);
          if (fieldErrors.partyName) setFieldErrors((e) => ({ ...e, partyName: undefined }));
        }}
        placeholder="Start typing vendor name"
      />
      {fieldErrors.partyName ? (
        <Text style={[localStyles.fieldError, { marginTop: -spacing.sm, marginBottom: spacing.sm }]}>
          {fieldErrors.partyName}
        </Text>
      ) : null}
      <DatePickerField
        label="Date"
        value={date}
        onChange={(v) => {
          setDate(v);
          if (fieldErrors.date) setFieldErrors((e) => ({ ...e, date: undefined }));
        }}
        error={fieldErrors.date}
      />
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
        {fieldErrors.items ? <Text style={localStyles.itemsError}>{fieldErrors.items}</Text> : null}

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
                <Ionicons name="close" size={ICON.inline} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={localStyles.totals}>
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Subtotal</Text>
            <MoneyText amount={subtotal} size="md" />
          </View>
          <FormInput
            label="Total Discount (₹)"
            value={discount}
            onChangeText={(v) => {
              setDiscount(v);
              if (fieldErrors.discount) setFieldErrors((e) => ({ ...e, discount: undefined }));
            }}
            money
            error={fieldErrors.discount}
          />
          <View style={[localStyles.totalRow, { marginTop: spacing.sm }]}>
            <Text style={localStyles.totalLabel}>Grand Total</Text>
            <MoneyText amount={total} size="lg" color={colors.primary} />
          </View>
        </View>
      </View>

      {fieldErrors.payments ? (
        <Text style={[localStyles.fieldError, { marginBottom: spacing.sm }]}>{fieldErrors.payments}</Text>
      ) : null}
      <PaymentSplitForm
        accounts={accounts}
        payments={payments}
        onChange={(p) => {
          setPayments(p);
          if (fieldErrors.payments) setFieldErrors((e) => ({ ...e, payments: undefined }));
        }}
        totalDue={Math.max(0, roundMoney(total - advanceAppliedPreview))}
        defaultDate={isValidISODate(date) ? date : undefined}
        mode="pay"
        advanceCredit={advanceCredit}
        applyAdvance={applyAdvance}
        onApplyAdvanceChange={setApplyAdvance}
        advanceApplied={advanceAppliedPreview}
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

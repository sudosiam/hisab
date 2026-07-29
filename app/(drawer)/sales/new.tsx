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
  SegmentedControl,
  useScreenStyles,
  ICON,
} from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { ProductPicker } from '../../../src/components/ProductPicker';
import { PaymentSplitForm, PaymentRow } from '../../../src/components/PaymentSplitForm';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { getSelectableAccounts } from '../../../src/services/banking';
import { createSale } from '../../../src/services/sales';
import { getPartyByName } from '../../../src/services/parties';
import {
  applyPartyAdvanceToSale,
  getPartyUnallocatedPaymentCredit,
} from '../../../src/services/paymentVouchers';
import { getNextSaleDocumentNo } from '../../../src/services/invoiceNumbers';

import { computeUntaxedDocument } from '../../../src/services/documentTotals';
import { DRAFT_KEYS, loadDraft, type SaleFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { useDatabaseActions, useRefreshKey } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, parseAmountInput, parseMoneyInput } from '../../../src/utils/format';
import { MoneyText } from '../../../src/components/MoneyText';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { addMoney, roundMoney } from '../../../src/utils/money';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { alertLoadFailed } from '../../../src/utils/uiFeedback';
import { radius, spacing, typography } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Product, SaleInvoiceType } from '../../../src/types';

interface LineItem {
  key: string;
  product_id: number;
  qty: string;
  unit_price: string;
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
    key: `sale-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_price: '',
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
  const { refresh } = useDatabaseActions();
  const refreshKey = useRefreshKey();
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
        rcmRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.xs,
        },
        rcmLabel: { fontSize: 13, fontWeight: '600', color: colors.text, flex: 1 },
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
        removeBtn: { padding: spacing.sm, marginBottom: spacing.md, alignItems: 'center', justifyContent: 'center' },
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [advanceCredit, setAdvanceCredit] = useState(0);
  const [applyAdvance, setApplyAdvance] = useState(false);
  const productsRef = React.useRef<Product[]>([]);
  productsRef.current = products;
  const leaveBypassRef = useRef(false);
  /** Skip one party-effect auto-toggle after restoring applyAdvance from a draft. */
  const skipAdvanceAutoRef = useRef(false);

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
      applyAdvance,
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
      applyAdvance,
    ]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.saleNew,
    draftPayload,
    { isEmpty: isSaleDraftEmpty }
  );

  useUnsavedChangesGuard(!isSaleDraftEmpty(draftPayload) || hasDraft, {
    bypassRef: leaveBypassRef,
    message: 'You have an unsaved sale draft that will be lost.',
  });

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
    setApplyAdvance(false);
    setAdvanceCredit(0);
    setItems([createEmptyLineItem()]);
    setFieldErrors({});
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
    const name = partyName.trim();
    if (!name) {
      setAdvanceCredit(0);
      setApplyAdvance(false);
      skipAdvanceAutoRef.current = false;
      return;
    }
    getPartyByName(name, 'customer')
      .then(async (party) => {
        if (cancelled) return;
        if (party) {
          setPartyPhone((current) => (current.trim() ? current : party.phone ?? ''));
        }
        const credit = await getPartyUnallocatedPaymentCredit(name, 'customer');
        if (!cancelled) {
          setAdvanceCredit(credit);
          if (skipAdvanceAutoRef.current) {
            skipAdvanceAutoRef.current = false;
            if (credit <= 0) setApplyAdvance(false);
            // else keep draft-restored applyAdvance
          } else {
            setApplyAdvance(credit > 0);
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
  }, [partyName]);

  const discountAmount = roundMoney(Math.max(0, parseMoneyInput(discount) || 0));
  const serviceChargesAmount = roundMoney(Math.max(0, parseMoneyInput(serviceCharges) || 0));
  const deferredItems = useDeferredValue(items);
  const deferredDiscount = useDeferredValue(discountAmount);
  const deferredServiceCharges = useDeferredValue(serviceChargesAmount);
  const docTotals = useMemo(() => {
    try {
      return computeUntaxedDocument({
        lines: deferredItems.map((item) => ({
          qty: parseAmountInput(item.qty) || 0,
          unit_price: parseMoneyInput(item.unit_price) || 0,
          hsn_sac: item.hsn_sac.trim() || null,
        })),
        discount_amount: deferredDiscount,
        service_charges: deferredServiceCharges,
      });
    } catch {
      return null;
    }
  }, [deferredItems, deferredDiscount, deferredServiceCharges]);

  const subtotal = docTotals?.subtotal ?? 0;
  const total = docTotals?.total_amount ?? 0;

  const cashPaidTotal = useMemo(
    () => payments.reduce((sum, p) => addMoney(sum, parseMoneyInput(p.amount) || 0), 0),
    [payments]
  );
  const advanceAppliedPreview =
    applyAdvance && advanceCredit > 0
      ? roundMoney(Math.min(advanceCredit, Math.max(0, total - cashPaidTotal)))
      : 0;
  const paidTotal = addMoney(cashPaidTotal, advanceAppliedPreview);
  const isOverpaid = paidTotal > total + 1;

  const addItem = () => {
    setItems([...items, createEmptyLineItem()]);
    if (fieldErrors.items) setFieldErrors((e) => ({ ...e, items: undefined }));
  };

  const updateItem = (
    index: number,
    field: 'product_id' | 'qty' | 'unit_price' | 'hsn_sac',
    value: string | number
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = productsRef.current.find((p) => p.id === value);
      if (product) {
        updated[index].unit_price = formatAmountInput(getProductSellPrice(product));
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
    if (!partyName.trim()) nextErrors.partyName = 'Customer name is required';
    if (!invoiceNo.trim()) {
      nextErrors.invoiceNo =
        invoiceType === 'bos' ? 'BOS number is required' : 'Invoice number is required';
    }
    if (!isValidISODate(date)) nextErrors.date = 'Select a valid invoice date';
    if (items.length === 0) {
      nextErrors.items = 'Add at least one item';
    } else {
      for (const item of items) {
        if (!item.product_id) {
          nextErrors.items = 'Select a product for each line item';
          break;
        }
        const qty = parseAmountInput(item.qty);
        const price = parseMoneyInput(item.unit_price);
        if (!qty || qty <= 0) {
          nextErrors.items = 'Each item must have quantity greater than zero';
          break;
        }
        if (!price || price <= 0) {
          nextErrors.items = 'Each item must have unit price greater than zero';
          break;
        }
      }
    }
    if (discountAmount > subtotal) nextErrors.discount = 'Discount cannot exceed subtotal';

    for (const p of payments) {
      const amt = parseMoneyInput(p.amount);
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

    const cashPaid = payments.reduce((sum, p) => addMoney(sum, parseMoneyInput(p.amount) || 0), 0);
    const advanceToApply =
      applyAdvance && advanceCredit > 0
        ? roundMoney(Math.min(advanceCredit, Math.max(0, total - cashPaid)))
        : 0;
    const paidTotal = addMoney(cashPaid, advanceToApply);
    if (paidTotal > total + 1) {
      nextErrors.payments = `Total payments cannot exceed invoice amount (${formatCurrency(total)}).`;
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

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
            unit_price: parseMoneyInput(i.unit_price) || 0,
            hsn_sac: i.hsn_sac.trim() || null,
          })),
          payments: payments
            .filter((p) => parseMoneyInput(p.amount) > 0 && p.account_id > 0)
            .map((p) => ({
              account_id: p.account_id,
              amount: parseMoneyInput(p.amount),
              date: p.date,
              notes: p.notes || undefined,
            })),
        });
        if (advanceToApply > 0) {
          await applyPartyAdvanceToSale(saleId, advanceToApply, date);
        }
        leaveBypassRef.current = true;
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
    <FormScreen
      stickyFooter={<DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />}
    >
      <View style={localStyles.headerStrip}>
        <SegmentedControl
          options={[
            { value: 'invoice', label: 'Invoice' },
            { value: 'bos', label: 'Bill of Supply' },
          ]}
          value={invoiceType}
          onChange={(next) => {
            setInvoiceType(next);
            getNextSaleDocumentNo(next)
              .then(setInvoiceNo)
              .catch((e) => alertLoadFailed(e));
          }}
        />
        <View style={localStyles.headerMeta}>
          <View style={localStyles.headerMetaGrow}>
            <FormInput
              label={invoiceType === 'bos' ? 'BOS No' : 'Invoice No'}
              value={invoiceNo}
              onChangeText={(v) => {
                setInvoiceNo(v);
                if (fieldErrors.invoiceNo) setFieldErrors((e) => ({ ...e, invoiceNo: undefined }));
              }}
              placeholder="Auto"
              error={fieldErrors.invoiceNo}
            />
          </View>
          <View style={localStyles.headerMetaDate}>
            <DatePickerField
              label="Date"
              value={date}
              onChange={(v) => {
                setDate(v);
                if (fieldErrors.date) setFieldErrors((e) => ({ ...e, date: undefined }));
              }}
              error={fieldErrors.date}
            />
          </View>
        </View>
      </View>

      <View style={localStyles.partyBlock}>
        <CustomerAutocomplete
          value={partyName}
          onChange={(v) => {
            setPartyName(v);
            if (fieldErrors.partyName) setFieldErrors((e) => ({ ...e, partyName: undefined }));
          }}
        />
        {fieldErrors.partyName ? (
          <Text style={[localStyles.fieldError, { marginTop: -spacing.sm }]}>{fieldErrors.partyName}</Text>
        ) : null}
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
        {fieldErrors.items ? <Text style={localStyles.itemsError}>{fieldErrors.items}</Text> : null}

        {items.map((item, index) => (
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
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Subtotal</Text>
            <MoneyText amount={subtotal} size="md" />
          </View>
          <View style={localStyles.discountRow}>
            <View style={localStyles.discountField}>
              <FormInput
                label="Discount"
                value={discount}
                onChangeText={(v) => {
                  setDiscount(v);
                  if (fieldErrors.discount) setFieldErrors((e) => ({ ...e, discount: undefined }));
                }}
                money
                error={fieldErrors.discount}
              />
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
          <View style={[localStyles.totalRow, { marginTop: 4 }]}>
            <Text style={localStyles.totalLabel}>Total</Text>
            <MoneyText amount={total} size="lg" color={colors.primary} />
          </View>
        </View>
      </View>

      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />

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
        advanceCredit={advanceCredit}
        applyAdvance={applyAdvance}
        onApplyAdvanceChange={setApplyAdvance}
        advanceApplied={advanceAppliedPreview}
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

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
import { DraftBanner } from '../../../src/components/DraftBanner';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { createAdjustmentNote } from '../../../src/services/adjustmentNotes';
import { getPartyByName } from '../../../src/services/parties';
import { getPurchaseById, getPurchaseItems } from '../../../src/services/purchases';
import { getSaleById, getSaleItems } from '../../../src/services/sales';
import { computeUntaxedDocument } from '../../../src/services/documentTotals';
import { DRAFT_KEYS, loadDraft, type NoteFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, parseAmountInput } from '../../../src/utils/format';
import { MoneyText } from '../../../src/components/MoneyText';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { parseRouteId } from '../../../src/utils/route';
import { alertLoadFailed } from '../../../src/utils/uiFeedback';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type {
  AdjustmentNoteDirection,
  AdjustmentNoteKind,
  Product,
} from '../../../src/types';

interface LineItem {
  key: string;
  product_id: number;
  description: string;
  qty: string;
  unit_price: string;
  hsn_sac: string;
}

let lineItemCounter = 0;
function createEmptyLineItem(): LineItem {
  lineItemCounter += 1;
  return {
    key: `note-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    description: '',
    qty: '1',
    unit_price: '',
    hsn_sac: '',
  };
}

function parseKindParam(value: string | string[] | undefined): AdjustmentNoteKind {
  return value === 'debit' ? 'debit' : 'credit';
}

function parseDirectionParam(value: string | string[] | undefined): AdjustmentNoteDirection {
  return value === 'purchase' ? 'purchase' : 'sale';
}

function isNoteDraftEmpty(d: NoteFormDraft): boolean {
  const hasText = d.partyName.trim() || d.reason.trim() || d.notes.trim();
  if (hasText) return false;
  if (d.items.length === 0) return true;
  if (
    d.items.some(
      (item) =>
        item.product_id > 0 ||
        item.description.trim() ||
        item.unit_price.trim() ||
        item.qty !== '1' ||
        item.hsn_sac.trim()
    )
  ) {
    return false;
  }
  return true;
}

export default function NewNoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    againstSaleId?: string;
    againstPurchaseId?: string;
    kind?: string;
    direction?: string;
  }>();
  const { refresh, refreshKey } = useDatabase();
  const styles = useScreenStyles();

  const { colors, isDark } = useTheme();

  const initialKind = parseKindParam(params.kind);
  const initialDirection = parseDirectionParam(params.direction);
  const againstSaleId = parseRouteId(params.againstSaleId);
  const againstPurchaseId = parseRouteId(params.againstPurchaseId);
  const draftsEnabled = !againstSaleId && !againstPurchaseId;
  const leaveBypassRef = useRef(false);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        linkedBanner: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
        },
        linkedText: { fontSize: 13, color: colors.textSecondary },
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
      }),
    [colors, isDark]
  );

  const [noteKind, setNoteKind] = useState<AdjustmentNoteKind>(initialKind);
  const [direction, setDirection] = useState<AdjustmentNoteDirection>(initialDirection);
  const [partyName, setPartyName] = useState('');
  const [partyId, setPartyId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [linkedInvoiceNo, setLinkedInvoiceNo] = useState<string | null>(null);
  const [linkedSaleId, setLinkedSaleId] = useState<number | null>(againstSaleId);
  const [linkedPurchaseId, setLinkedPurchaseId] = useState<number | null>(againstPurchaseId);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>(() => [createEmptyLineItem()]);
  const [loading, setLoading] = useState(false);
  const [prefillDone, setPrefillDone] = useState(false);
  const productsRef = React.useRef<Product[]>([]);
  productsRef.current = products;

  const draftPayload = useMemo<NoteFormDraft>(
    () => ({
      noteKind,
      direction,
      partyName,
      date,
      reason,
      notes,
      items,
    }),
    [noteKind, direction, partyName, date, reason, notes, items]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.noteNew,
    draftPayload,
    { enabled: draftsEnabled, isEmpty: isNoteDraftEmpty }
  );

  useUnsavedChangesGuard(
    draftsEnabled && (!isNoteDraftEmpty(draftPayload) || hasDraft),
    {
      bypassRef: leaveBypassRef,
      message: 'You have an unsaved note draft that will be lost.',
    }
  );

  const resetForm = () => {
    setNoteKind(initialKind);
    setDirection(initialDirection);
    setPartyName('');
    setPartyId(null);
    setDate(todayISO());
    setReason('');
    setNotes('');
    setItems([createEmptyLineItem()]);
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved note will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          resetForm();
        },
      },
    ]);
  };

  useFocusEffect(
    React.useCallback(() => {
      void refreshKey;
      getProducts()
        .then((p) => {
          productsRef.current = p;
          setProducts(p);
        })
        .catch((e) => alertLoadFailed(e));
    }, [refreshKey])
  );

  React.useEffect(() => {
    if (prefillDone) return;
    let cancelled = false;
    (async () => {
      try {
        if (againstSaleId) {
          const [sale, saleItems] = await Promise.all([
            getSaleById(againstSaleId),
            getSaleItems(againstSaleId),
          ]);
          if (cancelled || !sale) return;
          setDirection('sale');
          setLinkedSaleId(againstSaleId);
          setLinkedPurchaseId(null);
          setPartyName(sale.party_name);
          setPartyId(sale.party_id);
          setLinkedInvoiceNo(sale.invoice_no);
          setItems(
            saleItems.map((item) => ({
              key: `prefill-${item.id}`,
              product_id: item.product_id,
              description: item.product_name ?? '',
              qty: String(item.qty),
              unit_price: formatAmountInput(item.unit_price),
              hsn_sac: item.hsn_sac ?? '',
            }))
          );
        } else if (againstPurchaseId) {
          const [purchase, purchaseItems] = await Promise.all([
            getPurchaseById(againstPurchaseId),
            getPurchaseItems(againstPurchaseId),
          ]);
          if (cancelled || !purchase) return;
          setDirection('purchase');
          setLinkedPurchaseId(againstPurchaseId);
          setLinkedSaleId(null);
          setPartyName(purchase.supplier_name);
          setPartyId(purchase.party_id);
          setLinkedInvoiceNo(purchase.invoice_no);
          setItems(
            purchaseItems.map((item) => ({
              key: `prefill-${item.id}`,
              product_id: item.product_id,
              description: item.product_name ?? '',
              qty: String(item.qty),
              unit_price: formatAmountInput(item.unit_cost),
              hsn_sac: item.hsn_sac ?? '',
            }))
          );
        } else if (draftsEnabled) {
          const draft = await loadDraft<NoteFormDraft>(DRAFT_KEYS.noteNew);
          if (cancelled) return;
          if (draft && !isNoteDraftEmpty(draft)) {
            setNoteKind(draft.noteKind === 'debit' ? 'debit' : 'credit');
            setDirection(draft.direction === 'purchase' ? 'purchase' : 'sale');
            setPartyName(draft.partyName || '');
            setDate(isValidISODate(draft.date) ? draft.date : todayISO());
            setReason(draft.reason || '');
            setNotes(draft.notes || '');
            setItems(
              draft.items?.length
                ? draft.items.map((item) => ({
                    key: item.key || `note-item-${Date.now()}-${++lineItemCounter}`,
                    product_id: item.product_id || 0,
                    description: item.description || '',
                    qty: item.qty || '1',
                    unit_price: item.unit_price || '',
                    hsn_sac: item.hsn_sac || '',
                  }))
                : [createEmptyLineItem()]
            );
            noteDraftLoaded();
          }
        }
      } catch (e) {
        if (!cancelled) alertLoadFailed(e);
      } finally {
        if (!cancelled) {
          setPrefillDone(true);
          markReady();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    againstSaleId,
    againstPurchaseId,
    draftsEnabled,
    prefillDone,
    markReady,
    noteDraftLoaded,
  ]);

  React.useEffect(() => {
    let cancelled = false;
    const name = partyName.trim();
    if (!name) {
      setPartyId(null);
      return;
    }
    const partyType = direction === 'sale' ? 'customer' : 'vendor';
    getPartyByName(name, partyType)
      .then((party) => {
        if (cancelled) return;
        setPartyId(party?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) alertLoadFailed(e);
      });
    return () => {
      cancelled = true;
    };
  }, [partyName, direction]);

  const deferredItems = useDeferredValue(items);

  const docTotals = useMemo(() => {
    try {
      return computeUntaxedDocument({
        lines: deferredItems.map((item) => ({
          qty: parseAmountInput(item.qty) || 0,
          unit_price: parseAmountInput(item.unit_price) || 0,
          hsn_sac: item.hsn_sac.trim() || null,
        })),
        discount_amount: 0,
        service_charges: 0,
      });
    } catch {
      return null;
    }
  }, [deferredItems]);

  const total = docTotals?.total_amount ?? 0;

  const addItem = () => setItems([...items, createEmptyLineItem()]);

  const updateItem = (
    index: number,
    field: keyof LineItem,
    value: string | number
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = productsRef.current.find((p) => p.id === value);
      if (product) {
        updated[index].description = product.name;
        updated[index].unit_price = formatAmountInput(
          direction === 'sale' ? getProductSellPrice(product) : product.avg_cost
        );
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
      Alert.alert('Error', 'Party name is required');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Error', 'Add at least one item');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid note date');
      return;
    }

    const parsedItems = [];
    for (const item of items) {
      const qty = parseAmountInput(item.qty);
      const unitPrice = parseAmountInput(item.unit_price);
      if (!item.product_id && !item.description.trim()) {
        Alert.alert('Error', 'Each line needs a product or description');
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('Error', 'Enter valid quantities');
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        Alert.alert('Error', 'Enter valid unit prices');
        return;
      }
      parsedItems.push({
        product_id: item.product_id > 0 ? item.product_id : null,
        description: item.description.trim() || null,
        qty,
        unit_price: unitPrice,
        hsn_sac: item.hsn_sac.trim() || null,
      });
    }

    setLoading(true);
    try {
      const noteId = await createAdjustmentNote({
        note_kind: noteKind,
        direction,
        against_sale_id: direction === 'sale' ? linkedSaleId : null,
        against_purchase_id: direction === 'purchase' ? linkedPurchaseId : null,
        party_name: partyName.trim(),
        party_id: partyId,
        date,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
        items: parsedItems,
      });
      leaveBypassRef.current = true;
      if (draftsEnabled) {
        await clearDraftOnSave();
      }
      refresh();
      router.replace(`/(drawer)/notes/${noteId}` as never);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  const partyLabel = direction === 'sale' ? 'Customer' : 'Vendor';

  return (
    <FormScreen>
      <DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: spacing.sm }}>
        Adjusts party ledger (AR/AP and revenue/purchases). Does not change stock or the linked
        invoice due amount — record a stock adjustment or payment separately if needed.
      </Text>
      <SectionHeader title="Note type" />
      <SegmentedControl
        options={[
          { value: 'credit', label: 'Credit' },
          { value: 'debit', label: 'Debit' },
        ]}
        value={noteKind}
        onChange={setNoteKind}
      />

      <SectionHeader title="Direction" />
      <View
        style={{ opacity: linkedSaleId || linkedPurchaseId ? 0.5 : 1 }}
        pointerEvents={linkedSaleId || linkedPurchaseId ? 'none' : 'auto'}
      >
        <SegmentedControl
          options={[
            { value: 'sale', label: 'Sales' },
            { value: 'purchase', label: 'Purchase' },
          ]}
          value={direction}
          onChange={setDirection}
        />
      </View>

      {linkedInvoiceNo ? (
        <View style={localStyles.linkedBanner}>
          <Text style={localStyles.linkedText}>Against invoice: {linkedInvoiceNo}</Text>
        </View>
      ) : null}

      <CustomerAutocomplete
        label={partyLabel}
        value={partyName}
        onChange={setPartyName}
        partyType={direction === 'sale' ? 'customer' : 'vendor'}
      />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <FormInput label="Reason" value={reason} onChangeText={setReason} placeholder="Return, rate difference…" />
      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />

      <SectionHeader title="Items" />
      {items.map((item, index) => (
        <View key={item.key} style={localStyles.itemCard}>
          <ProductPicker
            label="Product (optional)"
            products={products}
            value={item.product_id}
            onChange={(id) => updateItem(index, 'product_id', id)}
          />
          {!item.product_id ? (
            <FormInput
              label="Description"
              value={item.description}
              onChangeText={(v) => updateItem(index, 'description', v)}
              placeholder="Line description"
            />
          ) : null}
          <View style={localStyles.itemRow}>
            <View style={localStyles.qtyField}>
              <FormInput
                label="Qty"
                value={item.qty}
                onChangeText={(v) => updateItem(index, 'qty', v)}
                keyboardType="decimal-pad"
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
              style={localStyles.removeBtn}
              onPress={() => removeItem(index)}
              accessibilityRole="button"
              accessibilityLabel="Remove line item"
            >
              <Ionicons name="close" size={ICON.inline} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TouchableOpacity onPress={addItem} style={{ marginBottom: spacing.sm }}>
        <Text style={styles.link}>+ Add item</Text>
      </TouchableOpacity>

      {docTotals ? (
        <View style={localStyles.totals}>
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Total</Text>
            <MoneyText amount={total} size="lg" color={colors.primary} />
          </View>
        </View>
      ) : null}

      <PrimaryButton title="Save Note" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

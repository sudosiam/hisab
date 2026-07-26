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
import { GstRateChips } from '../../../src/components/GstRateChips';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { createAdjustmentNote } from '../../../src/services/adjustmentNotes';
import { getPartyByName } from '../../../src/services/parties';
import { getPurchaseById, getPurchaseItems } from '../../../src/services/purchases';
import { getSaleById, getSaleItems } from '../../../src/services/sales';
import { getBusinessState, isTaxInclusivePricing } from '../../../src/services/appSettings';
import { useGstEnabled } from '../../../src/context/GstContext';
import { computeGstDocument, resolveStateFromPartyFields } from '../../../src/services/gst';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../../../src/utils/format';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { parseRouteId } from '../../../src/utils/route';
import { spacing, radius } from '../../../src/constants/theme';
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
  gst_rate: string;
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
    gst_rate: '',
    hsn_sac: '',
  };
}

function parseKindParam(value: string | string[] | undefined): AdjustmentNoteKind {
  return value === 'debit' ? 'debit' : 'credit';
}

function parseDirectionParam(value: string | string[] | undefined): AdjustmentNoteDirection {
  return value === 'purchase' ? 'purchase' : 'sale';
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

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        segmentRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
        segmentChip: {
          flex: 1,
          paddingVertical: 8,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          backgroundColor: colors.surface,
        },
        segmentChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        segmentText: { fontWeight: '600', color: colors.text, fontSize: 13 },
        segmentTextActive: { color: colors.onPrimary },
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
        removeBtn: { padding: spacing.sm, marginBottom: spacing.md },
        removeText: { color: colors.danger, fontSize: 16 },
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
  const [businessState, setBusinessState] = useState('');
  const gstEnabled = useGstEnabled();
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [partyState, setPartyState] = useState<string | null>(null);
  const [placeOfSupply, setPlaceOfSupply] = useState<string | null>(null);
  const productsRef = React.useRef<Product[]>([]);
  productsRef.current = products;

  useFocusEffect(
    React.useCallback(() => {
      void refreshKey;
      getProducts()
        .then((p) => {
          productsRef.current = p;
          setProducts(p);
        })
        .catch(() => {});
    }, [refreshKey])
  );

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getBusinessState(), isTaxInclusivePricing()])
      .then(([state, inclusive]) => {
        if (!cancelled) {
          setBusinessState(state);
          setTaxInclusive(inclusive);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
          setPlaceOfSupply(sale.place_of_supply);
          setLinkedInvoiceNo(sale.invoice_no);
          setItems(
            saleItems.map((item) => ({
              key: `prefill-${item.id}`,
              product_id: item.product_id,
              description: item.product_name ?? '',
              qty: String(item.qty),
              unit_price: formatAmountInput(item.unit_price),
              gst_rate: (item.gst_rate ?? 0) > 0 ? formatAmountInput(item.gst_rate ?? 0) : '',
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
          setPlaceOfSupply(purchase.place_of_supply);
          setLinkedInvoiceNo(purchase.invoice_no);
          setItems(
            purchaseItems.map((item) => ({
              key: `prefill-${item.id}`,
              product_id: item.product_id,
              description: item.product_name ?? '',
              qty: String(item.qty),
              unit_price: formatAmountInput(item.unit_cost),
              gst_rate: (item.gst_rate ?? 0) > 0 ? formatAmountInput(item.gst_rate ?? 0) : '',
              hsn_sac: item.hsn_sac ?? '',
            }))
          );
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      } finally {
        if (!cancelled) setPrefillDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [againstSaleId, againstPurchaseId, prefillDone]);

  React.useEffect(() => {
    let cancelled = false;
    const name = partyName.trim();
    if (!name) {
      setPartyState(null);
      return;
    }
    const partyType = direction === 'sale' ? 'customer' : 'vendor';
    getPartyByName(name, partyType)
      .then((party) => {
        if (cancelled) return;
        if (party) {
          setPartyId(party.id);
          setPartyState(resolveStateFromPartyFields(party.state, party.gstin));
        } else {
          setPartyId(null);
          setPartyState(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partyName, direction]);

  const deferredItems = useDeferredValue(items);

  const gstDoc = useMemo(() => {
    try {
      return computeGstDocument({
        lines: deferredItems.map((item) => ({
          qty: parseAmountInput(item.qty) || 0,
          unit_price: parseAmountInput(item.unit_price) || 0,
          gst_rate: parseAmountInput(item.gst_rate) || 0,
          hsn_sac: item.hsn_sac.trim() || null,
        })),
        discount_amount: 0,
        service_charges: 0,
        business_state: businessState || null,
        party_state: partyState,
        place_of_supply: placeOfSupply ?? undefined,
        gst_enabled: gstEnabled,
        tax_inclusive: taxInclusive,
      });
    } catch {
      return null;
    }
  }, [deferredItems, businessState, partyState, placeOfSupply, gstEnabled, taxInclusive]);

  const total = gstDoc?.total_amount ?? 0;

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
        gst_rate: parseAmountInput(item.gst_rate) || 0,
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
      <SectionHeader title="Note type" />
      <View style={localStyles.segmentRow}>
        {(['credit', 'debit'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            style={[localStyles.segmentChip, noteKind === k && localStyles.segmentChipActive]}
            onPress={() => setNoteKind(k)}
          >
            <Text style={[localStyles.segmentText, noteKind === k && localStyles.segmentTextActive]}>
              {k === 'credit' ? 'Credit' : 'Debit'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionHeader title="Direction" />
      <View style={localStyles.segmentRow}>
        {(['sale', 'purchase'] as const).map((d) => (
          <TouchableOpacity
            key={d}
            style={[
              localStyles.segmentChip,
              direction === d && localStyles.segmentChipActive,
              !!(linkedSaleId || linkedPurchaseId) && localStyles.segmentChip,
            ]}
            onPress={() => {
              if (linkedSaleId || linkedPurchaseId) return;
              setDirection(d);
            }}
            disabled={!!(linkedSaleId || linkedPurchaseId)}
          >
            <Text style={[localStyles.segmentText, direction === d && localStyles.segmentTextActive]}>
              {d === 'sale' ? 'Sales' : 'Purchase'}
            </Text>
          </TouchableOpacity>
        ))}
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
            <TouchableOpacity style={localStyles.removeBtn} onPress={() => removeItem(index)}>
              <Text style={localStyles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
          {gstEnabled ? (
            <>
              <GstRateChips
                value={item.gst_rate}
                onChange={(v) => updateItem(index, 'gst_rate', v)}
              />
              <FormInput
                label="HSN/SAC"
                value={item.hsn_sac}
                onChangeText={(v) => updateItem(index, 'hsn_sac', v)}
              />
            </>
          ) : null}
        </View>
      ))}
      <TouchableOpacity onPress={addItem} style={{ marginBottom: spacing.sm }}>
        <Text style={styles.link}>+ Add item</Text>
      </TouchableOpacity>

      {gstDoc ? (
        <View style={localStyles.totals}>
          {gstEnabled ? (
            <View style={localStyles.totalRow}>
              <Text style={localStyles.totalLabel}>Taxable</Text>
              <Text style={localStyles.totalValue}>{formatCurrency(gstDoc.taxable_amount)}</Text>
            </View>
          ) : null}
          {gstEnabled &&
          (gstDoc.cgst_amount ?? 0) + (gstDoc.sgst_amount ?? 0) + (gstDoc.igst_amount ?? 0) >
            0.009 ? (
            <View style={localStyles.totalRow}>
              <Text style={localStyles.totalLabel}>Tax</Text>
              <Text style={localStyles.totalValue}>
                {formatCurrency(
                  (gstDoc.cgst_amount ?? 0) + (gstDoc.sgst_amount ?? 0) + (gstDoc.igst_amount ?? 0)
                )}
              </Text>
            </View>
          ) : null}
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Total</Text>
            <Text style={localStyles.grandTotal}>{formatCurrency(total)}</Text>
          </View>
        </View>
      ) : null}

      <PrimaryButton title="Save Note" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  FormInput,
  FormScreen,
  ICON,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  SegmentedControl,
  useScreenStyles,
} from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { ProductPicker } from '../../../src/components/ProductPicker';
import { getProducts, getProductSellPrice } from '../../../src/services/inventory';
import { getSaleById, getSaleItems, updateSale } from '../../../src/services/sales';
import { getPartyByName } from '../../../src/services/parties';
import { getNextSaleDocumentNo } from '../../../src/services/invoiceNumbers';
import { computeUntaxedDocument } from '../../../src/services/documentTotals';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, formatQtyInput, parseAmountInput, parseMoneyInput } from '../../../src/utils/format';
import { MoneyText } from '../../../src/components/MoneyText';
import { isValidISODate } from '../../../src/utils/date';
import { roundMoney } from '../../../src/utils/money';
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
  hsn_sac: string;
}

let lineItemCounter = 0;
function createEmptyLineItem(): LineItem {
  lineItemCounter += 1;
  return {
    key: `sale-edit-item-${Date.now()}-${lineItemCounter}`,
    product_id: 0,
    qty: '1',
    unit_price: '',
    hsn_sac: '',
  };
}

export default function EditSaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabaseActions();
  const styles = useScreenStyles();

  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
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
        discountRow: { flexDirection: 'row', gap: spacing.sm },
        discountField: { flex: 1 },
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
        paidHint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
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
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;

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
        setPartyPhone('');
        setInvoiceNo(s.invoice_no);
        setInvoiceType(s.invoice_type === 'bos' ? 'bos' : 'invoice');
        setDate(s.date);
        setDiscount(formatAmountInput(s.discount_amount ?? 0));
        setServiceCharges(s.service_charges > 0 ? formatAmountInput(s.service_charges) : '');
        setNotes(s.notes ?? '');
        setProducts(productList);
        productsRef.current = productList;
        setItems(
          saleItems.length > 0
            ? saleItems.map((item) => ({
                key: `sale-item-${item.id}`,
                product_id: item.product_id,
                qty: formatQtyInput(item.qty),
                unit_price: formatAmountInput(item.unit_price),
                hsn_sac: item.hsn_sac ?? '',
              }))
            : productList.length > 0
              ? [createEmptyLineItem()]
              : []
        );
        savedSnapshotRef.current = JSON.stringify({
          partyName: s.party_name,
          partyPhone: '',
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
                  hsn_sac: item.hsn_sac ?? '',
                }))
              : [],
        });
        getPartyByName(s.party_name, 'customer')
          .then((party) => {
            const phone = party?.phone ?? '';
            if (phone) setPartyPhone(phone);
            // Align dirty-check baseline with async-loaded phone so load isn't marked dirty.
            if (savedSnapshotRef.current) {
              try {
                const snap = JSON.parse(savedSnapshotRef.current) as { partyPhone?: string };
                snap.partyPhone = phone;
                savedSnapshotRef.current = JSON.stringify(snap);
              } catch {
                /* keep prior snapshot */
              }
            }
          })
          .catch(() => {});
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
      if (loadedForRef.current !== saleId) {
        loadedForRef.current = saleId;
        load();
        return;
      }
      void reloadProducts();
    }, [load, saleId, reloadProducts])
  );

  const discountAmount = roundMoney(Math.max(0, parseMoneyInput(discount) || 0));
  const serviceChargesAmount = roundMoney(Math.max(0, parseMoneyInput(serviceCharges) || 0));

  const docTotals = useMemo(() => {
    try {
      return computeUntaxedDocument({
        lines: items.map((item) => ({
          qty: parseAmountInput(item.qty) || 0,
          unit_price: parseMoneyInput(item.unit_price) || 0,
          hsn_sac: item.hsn_sac.trim() || null,
        })),
        discount_amount: discountAmount,
        service_charges: serviceChargesAmount,
      });
    } catch {
      return null;
    }
  }, [items, discountAmount, serviceChargesAmount]);

  const subtotal = docTotals?.subtotal ?? 0;
  const total = docTotals?.total_amount ?? 0;

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
          hsn_sac: item.hsn_sac,
        })),
      }),
    [partyName, partyPhone, invoiceNo, invoiceType, date, discount, serviceCharges, notes, items]
  );
  const isDirty =
    savedSnapshotRef.current !== null && formSnapshot !== savedSnapshotRef.current;
  useUnsavedChangesGuard(isDirty);

  const addItem = () => {
    setItems([...items, createEmptyLineItem()]);
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
    if (total + 1 < sale.paid_amount) {
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
      const unitPrice = parseMoneyInput(item.unit_price);
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('Error', 'Each item must have quantity greater than zero');
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        Alert.alert('Error', 'Each item must have unit price greater than zero');
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
            service_charges: serviceChargesAmount,notes: notes.trim() || undefined,
            items: items.map((item) => ({
              product_id: item.product_id,
              qty: parseAmountInput(item.qty) || 0,
              unit_price: parseMoneyInput(item.unit_price) || 0,hsn_sac: item.hsn_sac.trim() || null,
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

  if (error) {
    return <ErrorState message={error} onRetry={() => { void load(); }} />;
  }

  if (!sale) {
    return (
      <EmptyState
        title="Not found"
        message="This record is missing or was deleted."
        actionLabel="Go Back"
        onAction={() => router.back()}
      />
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
            .catch(() => {});
        }}
      />
      <FormInput
        label={invoiceType === 'bos' ? 'BOS Number' : 'Invoice Number'}
        value={invoiceNo}
        onChangeText={setInvoiceNo}
        autoCapitalize="characters"
      />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />

      <View style={styles.section}>
        <SectionHeader title="Line Items" />

        {items.map((item, index) => (
          <View key={item.key} style={localStyles.itemCard}>
            <ProductPicker
              products={products}
              value={item.product_id}
              onChange={(productId) => updateItem(index, 'product_id', productId)}
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
          <FormInput
            label="Total Discount (₹)"
            value={discount}
            onChangeText={setDiscount}
            money
          />
          <View style={localStyles.discountRow}>
            <View style={localStyles.discountField}>
              <FormInput
                label="Service Charges (₹, optional)"
                value={serviceCharges}
                onChangeText={setServiceCharges}
                money
              />
            </View>
          </View>
          <View style={[localStyles.totalRow, { marginTop: spacing.sm }]}>
            <Text style={localStyles.totalLabel}>Grand Total</Text>
            <MoneyText amount={total} size="lg" color={colors.primary} />
          </View>
        </View>
      </View>

      <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
    </FormScreen>
  );
}

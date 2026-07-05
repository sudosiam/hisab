import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { ProductPicker } from '../../../src/components/ProductPicker';
import { PaymentSplitForm, PaymentRow } from '../../../src/components/PaymentSplitForm';
import { getProducts } from '../../../src/services/inventory';
import { getAccounts } from '../../../src/services/banking';
import { createPurchase } from '../../../src/services/purchases';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatCurrency } from '../../../src/utils/format';
import { todayISO } from '../../../src/utils/date';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Product } from '../../../src/types';

interface LineItem {
  product_id: number;
  qty: string;
  unit_cost: string;
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
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    Promise.all([getProducts(), getAccounts()]).then(([p, a]) => {
      setProducts(p);
      setAccounts(a);
      if (p.length > 0) {
        setItems([{ product_id: p[0].id, qty: '1', unit_cost: String(p[0].avg_cost.toFixed(2)) }]);
      }
    });
  }, []);

  const subtotal = items.reduce(
    (sum, item) => sum + (parseFloat(item.qty) || 0) * (parseFloat(item.unit_cost) || 0),
    0
  );
  const discountAmount = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(0, subtotal - discountAmount);

  const addItem = () => {
    if (products.length === 0) return;
    setItems([...items, { product_id: products[0].id, qty: '1', unit_cost: '0' }]);
  };

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index].unit_cost = String(product.avg_cost.toFixed(2));
      }
    }
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!supplierName.trim()) {
      Alert.alert('Error', 'Supplier name is required');
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

    setLoading(true);
    try {
      const id = await createPurchase({
        supplier_name: supplierName.trim(),
        date,
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
      refresh();
      router.replace(`/(drawer)/purchases/${id}`);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <CustomerAutocomplete
        label="Supplier"
        partyType="vendor"
        value={supplierName}
        onChange={setSupplierName}
        placeholder="Start typing vendor name"
      />
      <FormInput label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
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
            <View key={index} style={localStyles.itemCard}>
              <ProductPicker
                products={products}
                value={item.product_id}
                onChange={(id) => updateItem(index, 'product_id', id)}
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
                <TouchableOpacity onPress={() => removeItem(index)} style={localStyles.removeBtn}>
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
      />

      <PrimaryButton title="Save Purchase" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

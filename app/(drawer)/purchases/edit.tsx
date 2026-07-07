import React, { useCallback, useRef, useState } from 'react';
import { Alert, ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  useScreenStyles,
} from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { getPurchaseById, updatePurchase } from '../../../src/services/purchases';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, parseAmountInput } from '../../../src/utils/format';
import { isValidISODate } from '../../../src/utils/date';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { spacing } from '../../../src/constants/theme';
import type { Purchase } from '../../../src/types';

export default function EditPurchaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('');
  const [date, setDate] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchaseId = React.useMemo(() => {
    const raw = Array.isArray(id) ? id[0] : id;
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [id]);

  const load = useCallback(async () => {
    if (!purchaseId) {
      setError('Invalid purchase');
      setLoading(false);
      return;
    }
    try {
      const p = await getPurchaseById(purchaseId);
      if (p) {
        setPurchase(p);
        setSupplierName(p.supplier_name);
        setInvoiceNo(p.invoice_no);
        setVendorInvoiceNo(p.vendor_invoice_no ?? '');
        setDate(p.date);
        setDiscount(formatAmountInput(p.discount_amount ?? 0));
        setNotes(p.notes ?? '');
        setError(null);
      } else {
        setError('Purchase not found');
      }
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  const loadedForRef = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (loadedForRef.current === purchaseId) return;
      loadedForRef.current = purchaseId;
      load();
    }, [load, purchaseId])
  );

  const handleSave = async () => {
    if (!purchase || saving) return;
    if (!supplierName.trim()) {
      Alert.alert('Error', 'Supplier name is required');
      return;
    }
    if (!invoiceNo.trim()) {
      Alert.alert('Error', 'Purchase number is required');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid purchase date');
      return;
    }
    const discountValue = discount.trim() ? parseAmountInput(discount) : 0;
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      Alert.alert('Error', 'Enter a valid discount amount');
      return;
    }
    if (discountValue > purchase.subtotal + 0.01) {
      Alert.alert('Error', 'Discount cannot exceed subtotal');
      return;
    }

    setSaving(true);
    try {
      await saveWithDuplicateInvoiceWarning(
        'purchases',
        invoiceNo,
        async () => {
          await updatePurchase(purchase.id, {
            supplier_name: supplierName,
            invoice_no: invoiceNo.trim(),
            vendor_invoice_no: vendorInvoiceNo.trim() || undefined,
            date,
            // Discount is read-only here (baked into inventory cost). Always send the
            // exact stored value so edits to other fields never trip the guard.
            discount_amount: purchase.discount_amount ?? 0,
            notes: notes.trim() || undefined,
          });
          refresh();
          router.back();
        },
        purchase.id
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

  if (error || !purchase) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Purchase not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FormScreen>
      <CustomerAutocomplete
        value={supplierName}
        onChange={setSupplierName}
        partyType="vendor"
        label="Supplier"
        placeholder="Supplier name"
      />
      <FormInput
        label="Purchase Number"
        value={invoiceNo}
        onChangeText={setInvoiceNo}
        autoCapitalize="characters"
      />
      <FormInput
        label="Vendor Invoice No (optional)"
        value={vendorInvoiceNo}
        onChangeText={setVendorInvoiceNo}
      />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <View style={styles.card}>
        <Text style={styles.label}>Total Discount</Text>
        <Text style={styles.amount}>₹ {discount || '0'}</Text>
        <Text style={styles.cardSub}>
          Discount is built into inventory costs. To change it, delete and re-enter the purchase.
        </Text>
      </View>
      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />
      <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
    </FormScreen>
  );
}

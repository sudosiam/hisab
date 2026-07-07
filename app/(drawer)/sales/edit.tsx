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
import { getSaleById, updateSale } from '../../../src/services/sales';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../../../src/utils/format';
import { saveWithDuplicateInvoiceWarning } from '../../../src/utils/duplicateInvoice';
import { isValidISODate } from '../../../src/utils/date';
import { spacing } from '../../../src/constants/theme';
import type { Sale } from '../../../src/types';

export default function EditSaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [sale, setSale] = useState<Sale | null>(null);
  const [partyName, setPartyName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState('');
  const [discount, setDiscount] = useState('0');
  const [serviceCharges, setServiceCharges] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const s = await getSaleById(saleId);
      if (s) {
        setSale(s);
        setPartyName(s.party_name);
        setInvoiceNo(s.invoice_no);
        setDate(s.date);
        setDiscount(formatAmountInput(s.discount_amount ?? 0));
        setServiceCharges(s.service_charges > 0 ? formatAmountInput(s.service_charges) : '');
        setNotes(s.notes ?? '');
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

  // Load once per sale — refocusing must not wipe unsaved edits.
  const loadedForRef = useRef<number | null>(null);
  useFocusEffect(useCallback(() => {
    if (loadedForRef.current === saleId) return;
    loadedForRef.current = saleId;
    load();
  }, [load, saleId]));

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
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid invoice date');
      return;
    }
    const discountValue = discount.trim() ? parseAmountInput(discount) : 0;
    const serviceValue = serviceCharges.trim() ? parseAmountInput(serviceCharges) : 0;
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      Alert.alert('Error', 'Enter a valid discount amount');
      return;
    }
    if (!Number.isFinite(serviceValue) || serviceValue < 0) {
      Alert.alert('Error', 'Enter a valid service charge amount');
      return;
    }
    if (discountValue > sale.subtotal + 0.01) {
      Alert.alert('Error', 'Discount cannot exceed subtotal');
      return;
    }
    const newTotal = Math.max(0, sale.subtotal - discountValue + serviceValue);
    if (newTotal + 0.01 < sale.paid_amount) {
      Alert.alert(
        'Error',
        `New total (${formatCurrency(newTotal)}) cannot be less than the amount already paid (${formatCurrency(sale.paid_amount)}). Remove payments first.`
      );
      return;
    }
    setSaving(true);
    try {
      await saveWithDuplicateInvoiceWarning(
        'sales',
        invoiceNo,
        async () => {
          await updateSale(sale.id, {
            party_name: partyName,
            invoice_no: invoiceNo.trim(),
            date,
            discount_amount: discountValue,
            service_charges: serviceValue,
            notes: notes.trim() || undefined,
          });
          refresh();
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

  if (error || !sale) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Sale not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FormScreen>
      <View style={styles.infoBox}>
        <Text style={styles.cardSub}>
          This edits invoice details only. Line items and recorded payments stay unchanged.
        </Text>
      </View>
      <CustomerAutocomplete value={partyName} onChange={setPartyName} />
      <FormInput
        label="Invoice Number"
        value={invoiceNo}
        onChangeText={setInvoiceNo}
        autoCapitalize="characters"
      />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <FormInput
        label="Total Discount (₹)"
        value={discount}
        onChangeText={setDiscount}
        keyboardType="decimal-pad"
      />
      <FormInput
        label="Service Charges (₹, optional)"
        value={serviceCharges}
        onChangeText={setServiceCharges}
        keyboardType="decimal-pad"
        placeholder="0"
      />
      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />
      <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
    </FormScreen>
  );
}

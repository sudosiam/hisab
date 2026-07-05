import React, { useCallback, useState } from 'react';
import { ScrollView, Alert, ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { FormInput, PrimaryButton, useScreenStyles } from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { getSaleById, updateSale } from '../../../src/services/sales';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
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
  const [date, setDate] = useState('');
  const [discount, setDiscount] = useState('0');
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
    const s = await getSaleById(saleId);
    if (s) {
      setSale(s);
      setPartyName(s.party_name);
      setDate(s.date);
      setDiscount(String(s.discount_amount ?? 0));
      setNotes(s.notes ?? '');
      setError(null);
    } else {
      setError('Sale not found');
    }
    setLoading(false);
  }, [saleId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSave = async () => {
    if (!sale) return;
    setSaving(true);
    try {
      await updateSale(sale.id, {
        party_name: partyName,
        date,
        discount_amount: parseFloat(discount) || 0,
        notes: notes.trim() || undefined,
      });
      refresh();
      router.back();
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <CustomerAutocomplete value={partyName} onChange={setPartyName} />
      <FormInput label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <FormInput
        label="Total Discount (₹)"
        value={discount}
        onChangeText={setDiscount}
        keyboardType="decimal-pad"
      />
      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />
      <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
    </ScrollView>
  );
}

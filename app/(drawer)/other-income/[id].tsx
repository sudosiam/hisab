import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  useScreenStyles,
} from '../../../src/components/ui';
import { StatCard } from '../../../src/components/StatCard';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { otherIncomeCategorySource } from '../../../src/components/categorySources';
import {
  deleteOtherIncome,
  getAccountsForPicker,
  getOtherIncomeById,
  updateOtherIncome,
} from '../../../src/services/otherIncome';
import { formatSqliteError } from '../../../src/db/database';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatAmountInput, parsePositiveAmount } from '../../../src/utils/format';
import { isValidISODate } from '../../../src/utils/date';
import { spacing } from '../../../src/constants/theme';
import type { Account, OtherIncome } from '../../../src/types';

export default function OtherIncomeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        title: { fontSize: 20, fontWeight: '700', color: colors.text },
        meta: { color: colors.textSecondary, marginTop: 4 },
        kpiRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginVertical: spacing.md,
        },
      }),
    [colors]
  );

  const [item, setItem] = useState<OtherIncome | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemId = useMemo(() => parseRouteId(id), [id]);

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState(0);

  const fillForm = (entry: OtherIncome) => {
    setCategory(entry.category);
    setDescription(entry.description);
    setAmount(formatAmountInput(entry.amount));
    setDate(entry.date);
    setAccountId(entry.account_id);
  };

  const load = useCallback(async () => {
    if (!itemId) {
      setError('Invalid entry');
      setLoading(false);
      return;
    }
    try {
      const entry = await getOtherIncomeById(itemId);
      const a = await getAccountsForPicker(entry?.account_id);
      setItem(entry);
      setAccounts(a);
      if (entry) fillForm(entry);
      setError(entry ? null : 'Entry not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const editingRef = React.useRef(false);
  editingRef.current = editing;

  const hasLoadedRef = React.useRef(false);
  useFocusEffect(useCallback(() => {
    // Don't reload over an open edit form — it would wipe unsaved changes.
    if (editingRef.current) return;
    if (!hasLoadedRef.current) setLoading(true);
    load().finally(() => {
      hasLoadedRef.current = true;
    });
  }, [load]));

  const handleSave = async () => {
    if (!item || saving) return;
    const amt = parsePositiveAmount(amount);
    if (!category.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Category, description, amount, and account are required');
      return;
    }
    if (amt === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Select a bank/cash account');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid income date');
      return;
    }
    setSaving(true);
    try {
      await updateOtherIncome(item.id, {
        category: category.trim(),
        description: description.trim(),
        amount: amt,
        account_id: accountId,
        date,
      });
      refresh();
      setEditing(false);
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
    Alert.alert('Delete Other Income', `Delete "${item.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOtherIncome(item.id);
            refresh();
            router.back();
          } catch (e) {
            Alert.alert('Error', formatSqliteError(e));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !item) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Entry not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FormScreen>
      {!editing ? (
        <>
          <Text style={localStyles.title}>{item.category}</Text>
          <Text style={localStyles.meta}>{item.description}</Text>
          <Text style={localStyles.meta}>{item.date} · {item.account_name}</Text>
          <View style={localStyles.kpiRow}>
            <StatCard label="Amount" value={item.amount} color={colors.success} />
          </View>
        </>
      ) : (
        <>
          <CategoryPicker value={category} onChange={setCategory} source={otherIncomeCategorySource} />
          <FormInput label="Description" value={description} onChangeText={setDescription} />
          <FormInput
            label="Amount (₹)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <DatePickerField label="Date" value={date} onChange={setDate} />
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
          <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
        </>
      )}

      <PrimaryButton
        title={editing ? 'Cancel Edit' : 'Edit'}
        onPress={() => {
          if (editing) fillForm(item);
          setEditing(!editing);
        }}
        variant="secondary"
      />
      <PrimaryButton title="Delete" onPress={handleDelete} variant="danger" />
    </FormScreen>
  );
}

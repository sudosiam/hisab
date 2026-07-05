import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { AccountPicker } from '../../../src/components/AccountPicker';
import {
  deleteExpense,
  getAccounts,
  getExpenseById,
  updateExpense,
} from '../../../src/services/banking';
import { formatSqliteError } from '../../../src/db/database';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatCurrency } from '../../../src/utils/format';
import { spacing, radius } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Expense } from '../../../src/types';

const RECURRENCE_OPTIONS = ['Monthly', 'Weekly', 'Yearly'];

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        amount: { fontSize: 28, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
        summary: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginVertical: spacing.md,
          gap: spacing.sm,
        },
        recurring: { color: colors.primary, fontWeight: '600', fontSize: 13 },
        chipRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
        chip: {
          paddingHorizontal: spacing.md,
          paddingVertical: 8,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { fontSize: 12, color: colors.text, fontWeight: '600' },
        chipTextActive: { color: colors.onPrimary },
      }),
    [colors, isDark]
  );

  const [expense, setExpense] = useState<Expense | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expenseId = useMemo(() => parseRouteId(id), [id]);

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState('Monthly');

  const fillForm = (e: Expense) => {
    setCategory(e.category);
    setDescription(e.description);
    setAmount(String(e.amount));
    setDate(e.date);
    setAccountId(e.account_id);
    setIsRecurring(!!e.is_recurring);
    setRecurrence(e.recurrence ?? 'Monthly');
  };

  const load = useCallback(async () => {
    if (!expenseId) {
      setError('Invalid expense');
      setLoading(false);
      return;
    }
    try {
      const [e, a] = await Promise.all([getExpenseById(expenseId), getAccounts()]);
      setExpense(e);
      setAccounts(a);
      if (e) fillForm(e);
      setError(e ? null : 'Expense not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setExpense(null);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  const handleSave = async () => {
    if (!expense) return;
    const amt = parseFloat(amount);
    if (!category.trim() || !description.trim() || !amt) {
      Alert.alert('Error', 'Fill all fields');
      return;
    }
    setSaving(true);
    try {
      await updateExpense(expense.id, {
        category: category.trim(),
        description: description.trim(),
        amount: amt,
        account_id: accountId,
        date,
        is_recurring: isRecurring,
        recurrence: isRecurring ? recurrence : undefined,
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
    if (!expense) return;
    Alert.alert(
      'Delete Expense',
      `Delete ${expense.category} — ${formatCurrency(expense.amount)}? Account balance will be reversed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(expense.id);
              refresh();
              router.back();
            } catch (e) {
              Alert.alert('Error', formatSqliteError(e));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !expense) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Expense not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (editing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <SectionHeader title="Edit Expense" />
        <FormInput label="Category" value={category} onChangeText={setCategory} />
        <FormInput label="Description" value={description} onChangeText={setDescription} />
        <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <FormInput label="Date" value={date} onChangeText={setDate} />
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />

        <View style={[styles.row, { marginVertical: spacing.sm }]}>
          <Text style={styles.label}>Recurring</Text>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        {isRecurring ? (
          <View style={localStyles.chipRow}>
            {RECURRENCE_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[localStyles.chip, recurrence === r && localStyles.chipActive]}
                onPress={() => setRecurrence(r)}
              >
                <Text style={recurrence === r ? localStyles.chipTextActive : localStyles.chipText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
        <PrimaryButton title="Cancel" onPress={() => { setEditing(false); fillForm(expense); }} variant="secondary" />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{expense.category}</Text>
          <Text style={localStyles.amount}>{formatCurrency(expense.amount)}</Text>
        </View>
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={styles.link}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={localStyles.summary}>
        <View style={styles.row}>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.value}>{expense.description}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{expense.date}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Paid From</Text>
          <Text style={styles.value}>{expense.account_name}</Text>
        </View>
        {expense.is_recurring ? (
          <Text style={localStyles.recurring}>Recurring · {expense.recurrence ?? 'Monthly'}</Text>
        ) : null}
      </View>

      <PrimaryButton title="Delete Expense" onPress={handleDelete} variant="danger" />
    </ScrollView>
  );
}

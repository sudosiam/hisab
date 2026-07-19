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
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { StatCard } from '../../../src/components/StatCard';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { expenseCategorySource } from '../../../src/components/categorySources';
import {
  deleteExpense,
  getAccountsForPicker,
  getExpenseById,
  updateExpense,
} from '../../../src/services/banking';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { formatSqliteError } from '../../../src/db/database';
import { isValidISODate, formatDisplayDate } from '../../../src/utils/date';
import { spacing, radius } from '../../../src/constants/theme';
import type { Account, Expense } from '../../../src/types';

const RECURRENCE_OPTIONS = ['Monthly', 'Weekly', 'Yearly'];

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        kpiRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginVertical: spacing.md,
        },
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
    [colors]
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
    setAmount(formatAmountInput(e.amount));
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
      const e = await getExpenseById(expenseId);
      const a = await getAccountsForPicker(e?.account_id, { includeExcluded: true });
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

  const isEditDirty = useMemo(() => {
    if (!editing || !expense) return false;
    const amt = parsePositiveAmount(amount);
    return (
      category.trim() !== expense.category ||
      description.trim() !== expense.description ||
      (amt ?? -1) !== expense.amount ||
      date !== expense.date ||
      accountId !== expense.account_id ||
      !!isRecurring !== !!expense.is_recurring ||
      (isRecurring ? recurrence : 'Monthly') !== (expense.recurrence ?? 'Monthly')
    );
  }, [editing, expense, category, description, amount, date, accountId, isRecurring, recurrence]);
  useUnsavedChangesGuard(isEditDirty);

  const handleSave = async () => {
    if (!expense || saving) return;
    if (!category.trim()) {
      Alert.alert('Missing category', 'Choose an expense category.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Missing description', 'Enter what this expense was for.');
      return;
    }
    const amt = parsePositiveAmount(amount);
    if (amt === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Select a bank/cash account');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid expense date');
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
      <FormScreen>
        <SectionHeader title="Edit Expense" />
        <CategoryPicker value={category} onChange={setCategory} source={expenseCategorySource} />
        <FormInput label="Description" value={description} onChangeText={setDescription} />
        <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} money />
        <DatePickerField label="Date" value={date} onChange={setDate} />
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />

        <View style={[styles.row, { marginVertical: spacing.sm }]}>
          <Text style={styles.label}>Recurring</Text>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel="Recurring expense"
          />
        </View>
        {isRecurring ? (
          <View style={localStyles.chipRow}>
            {RECURRENCE_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[localStyles.chip, recurrence === r && localStyles.chipActive]}
                onPress={() => setRecurrence(r)}
                accessibilityRole="button"
                accessibilityState={{ selected: recurrence === r }}
              >
                <Text style={recurrence === r ? localStyles.chipTextActive : localStyles.chipText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
        <PrimaryButton title="Cancel" onPress={() => { setEditing(false); fillForm(expense); }} variant="secondary" />
      </FormScreen>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{expense.category}</Text>
          <Text style={styles.cardSub}>{expense.description}</Text>
        </View>
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={styles.link}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={localStyles.kpiRow}>
        <StatCard label="Amount" value={expense.amount} color={colors.warning} />
        <StatCard label="Date" displayValue={formatDisplayDate(expense.date)} color={colors.primary} />
        <StatCard
          label="Account"
          displayValue={expense.account_name ?? '—'}
          color={colors.accent}
          subtitle={expense.is_recurring ? `Recurring · ${expense.recurrence ?? 'Monthly'}` : 'One-time'}
        />
      </View>

      <PrimaryButton title="Delete Expense" onPress={handleDelete} variant="danger" />
    </ScrollView>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { ThemedSwitch } from '../../../src/components/ThemedSwitch';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  SegmentedControl,
  useScreenStyles,
} from '../../../src/components/ui';
import { StatCard } from '../../../src/components/StatCard';
import { DetailSkeleton } from '../../../src/components/Skeleton';
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
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { formatSqliteError } from '../../../src/db/database';
import { isValidISODate, formatDisplayDate } from '../../../src/utils/date';
import { spacing } from '../../../src/constants/theme';
import type { Account, Expense } from '../../../src/types';

const RECURRENCE_OPTIONS: { value: 'Monthly' | 'Weekly' | 'Yearly'; label: string }[] = [
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Yearly', label: 'Yearly' },
];

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabaseActions();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: spacing.sm,
          width: '100%',
        },
        headerText: { flex: 1, minWidth: 0 },
        editTap: {
          flexShrink: 0,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.xs,
          minHeight: 44,
          justifyContent: 'center',
        },
        kpiFull: { width: '100%', maxWidth: '100%', flexBasis: '100%', flexGrow: 1 },
        kpiHalf: { flexGrow: 1, flexBasis: '47%', minWidth: 0, maxWidth: '100%' },
        deleteWrap: {
          width: '100%',
          maxWidth: '100%',
          marginTop: spacing.sm,
          alignSelf: 'stretch',
        },
        chipRow: { marginBottom: spacing.sm },
      }),
    []
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
    return <DetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => { void load(); }} />;
  }

  if (!expense) {
    return (
      <EmptyState
        title="Not found"
        message="This record is missing or was deleted."
        actionLabel="Go Back"
        onAction={() => router.back()}
      />
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
          <ThemedSwitch
            value={isRecurring}
            onValueChange={setIsRecurring}
            accessibilityLabel="Recurring expense"
          />
        </View>
        {isRecurring ? (
          <View style={localStyles.chipRow}>
            <SegmentedControl
              options={RECURRENCE_OPTIONS}
              value={recurrence as 'Monthly' | 'Weekly' | 'Yearly'}
              onChange={setRecurrence}
            />
          </View>
        ) : null}

        <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
        <PrimaryButton title="Cancel" onPress={() => { setEditing(false); fillForm(expense); }} variant="secondary" />
      </FormScreen>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { width: '100%' }]}
    >
      <View style={localStyles.header}>
        <View style={localStyles.headerText}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {expense.category}
          </Text>
          <Text style={styles.cardSub} numberOfLines={3}>
            {expense.description}
          </Text>
        </View>
        <TouchableOpacity
          style={localStyles.editTap}
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel="Edit expense"
        >
          <Text style={styles.link}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.detailKpiRow}>
        <StatCard
          label="Amount"
          value={expense.amount}
          color={colors.warning}
          style={localStyles.kpiFull}
        />
        <StatCard
          label="Date"
          displayValue={formatDisplayDate(expense.date)}
          color={colors.primary}
          style={localStyles.kpiHalf}
        />
        <StatCard
          label="Account"
          displayValue={expense.account_name ?? '—'}
          color={colors.accent}
          subtitle={expense.is_recurring ? `Recurring · ${expense.recurrence ?? 'Monthly'}` : 'One-time'}
          style={localStyles.kpiHalf}
        />
      </View>

      <View style={localStyles.deleteWrap}>
        <PrimaryButton title="Delete Expense" onPress={handleDelete} variant="danger" />
      </View>
    </ScrollView>
  );
}

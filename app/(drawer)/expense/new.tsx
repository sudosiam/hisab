import React, { useMemo, useState } from 'react';
import { Alert, Switch, TouchableOpacity, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { expenseCategorySource } from '../../../src/components/categorySources';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { createExpense, getPaymentAccounts } from '../../../src/services/banking';
import { DRAFT_KEYS, loadDraft, type ExpenseFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { parsePositiveAmount } from '../../../src/utils/format';
import { spacing, radius } from '../../../src/constants/theme';
import type { Account } from '../../../src/types';

const RECURRENCE_OPTIONS = ['Monthly', 'Weekly', 'Yearly'];

function isExpenseDraftEmpty(d: ExpenseFormDraft): boolean {
  return (
    !d.category.trim() &&
    !d.description.trim() &&
    !d.amount.trim() &&
    !d.isRecurring
  );
}

export default function NewExpenseScreen() {
  const router = useRouter();
  const { refresh, refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState('Monthly');
  const [loading, setLoading] = useState(false);

  const draftPayload = useMemo<ExpenseFormDraft>(
    () => ({
      category,
      description,
      amount,
      date,
      accountId,
      isRecurring,
      recurrence,
    }),
    [category, description, amount, date, accountId, isRecurring, recurrence]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.expenseNew,
    draftPayload,
    { isEmpty: isExpenseDraftEmpty }
  );

  const resetForm = (defaultAccountId: number) => {
    setCategory('');
    setDescription('');
    setAmount('');
    setDate(todayISO());
    setAccountId(defaultAccountId);
    setIsRecurring(false);
    setRecurrence('Monthly');
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved expense will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          resetForm(accountId || accounts[0]?.id || 0);
        },
      },
    ]);
  };

  const reloadAccounts = React.useCallback(async () => {
    try {
      const a = await getPaymentAccounts();
      setAccounts(a);
      setAccountId((current) =>
        current && a.some((acc) => acc.id === current) ? current : a[0]?.id ?? 0
      );
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void reloadAccounts();
    }, [reloadAccounts, refreshKey])
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await getPaymentAccounts();
        if (cancelled) return;
        setAccounts(a);
        const defaultAccount = a[0]?.id ?? 0;
        const draft = await loadDraft<ExpenseFormDraft>(DRAFT_KEYS.expenseNew);
        if (cancelled) return;
        if (draft && !isExpenseDraftEmpty(draft)) {
          setCategory(draft.category || '');
          setDescription(draft.description || '');
          setAmount(draft.amount || '');
          setDate(isValidISODate(draft.date) ? draft.date : todayISO());
          setAccountId(
            draft.accountId && a.some((acc) => acc.id === draft.accountId)
              ? draft.accountId
              : defaultAccount
          );
          setIsRecurring(draft.isRecurring ?? false);
          setRecurrence(draft.recurrence || 'Monthly');
          noteDraftLoaded();
        } else if (a.length > 0) {
          setAccountId(defaultAccount);
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      } finally {
        if (!cancelled) markReady();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markReady, noteDraftLoaded]);

  const handleSave = async () => {
    if (loading) return;
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
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid expense date');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', accounts.length === 0
        ? 'Add a bank or cash account in Banking first.'
        : 'Select a bank/cash account');
      return;
    }
    setLoading(true);
    try {
      const id = await createExpense({
        category: category.trim(),
        description: description.trim(),
        amount: amt!,
        account_id: accountId,
        date,
        is_recurring: isRecurring,
        recurrence: isRecurring ? recurrence : undefined,
      });
      await clearDraftOnSave();
      refresh();
      router.replace(`/(drawer)/expense/${id}` as never);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen>
      <DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />
      <SectionHeader title="New Expense" />
      <CategoryPicker value={category} onChange={setCategory} source={expenseCategorySource} />
      <FormInput label="Description" value={description} onChangeText={setDescription} />
      <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} money />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      {accounts.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm }}>
          Add a bank or cash account in Banking before recording expenses.
        </Text>
      ) : null}
      <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />

      <View style={[styles.row, { marginVertical: spacing.sm }]}>
        <Text style={styles.label}>Recurring Expense</Text>
        <Switch
          value={isRecurring}
          onValueChange={setIsRecurring}
          trackColor={{ false: colors.border, true: colors.primary }}
          accessibilityLabel="Recurring expense"
        />
      </View>
      {isRecurring ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
          {RECURRENCE_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: recurrence === r ? colors.primary : colors.border,
                backgroundColor: recurrence === r ? colors.primary : colors.surface,
              }}
              onPress={() => setRecurrence(r)}
              accessibilityRole="button"
              accessibilityState={{ selected: recurrence === r }}
            >
              <Text style={{ color: recurrence === r ? colors.onPrimary : colors.text, fontWeight: '600', fontSize: 12 }}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <PrimaryButton
        title="Save Expense"
        onPress={handleSave}
        loading={loading}
        disabled={accounts.length === 0}
      />
    </FormScreen>
  );
}

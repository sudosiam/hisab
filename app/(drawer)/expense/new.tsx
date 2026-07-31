import React, { useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ThemedSwitch } from '../../../src/components/ThemedSwitch';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  SegmentedControl,
  useScreenStyles,
} from '../../../src/components/ui';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { expenseCategorySource } from '../../../src/components/categorySources';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { InlineDropdown } from '../../../src/components/InlineDropdown';
import { createExpense, getPaymentAccounts } from '../../../src/services/banking';
import { getOpenBorrowedLoans } from '../../../src/services/loans';
import { DRAFT_KEYS, loadDraft, type ExpenseFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { spacing } from '../../../src/constants/theme';
import type { Account, Loan } from '../../../src/types';

const RECURRENCE_OPTIONS: { value: 'Monthly' | 'Weekly' | 'Yearly'; label: string }[] = [
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Yearly', label: 'Yearly' },
];

const FUNDING_OPTIONS: { value: 'account' | 'borrowed'; label: string }[] = [
  { value: 'account', label: 'Cash/Bank' },
  { value: 'borrowed', label: 'Borrowed' },
];

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
  const [borrowedLoans, setBorrowedLoans] = React.useState<Loan[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [loanId, setLoanId] = useState(0);
  const [fundingMode, setFundingMode] = useState<'account' | 'borrowed'>('account');
  const [loanPickerOpen, setLoanPickerOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState('Monthly');
  const [loading, setLoading] = useState(false);
  const leaveBypassRef = useRef(false);

  const draftPayload = useMemo<ExpenseFormDraft>(
    () => ({
      category,
      description,
      amount,
      date,
      accountId,
      fundingMode,
      loanId,
      isRecurring,
      recurrence,
    }),
    [category, description, amount, date, accountId, fundingMode, loanId, isRecurring, recurrence]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.expenseNew,
    draftPayload,
    { isEmpty: isExpenseDraftEmpty }
  );

  useUnsavedChangesGuard(!isExpenseDraftEmpty(draftPayload) || hasDraft, {
    bypassRef: leaveBypassRef,
    message: 'You have an unsaved expense draft that will be lost.',
  });

  const resetForm = (defaultAccountId: number) => {
    setCategory('');
    setDescription('');
    setAmount('');
    setDate(todayISO());
    setAccountId(defaultAccountId);
    setLoanId(0);
    setFundingMode('account');
    setIsRecurring(false);
    setRecurrence('Monthly');
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved expense will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardDraft();
          resetForm(accounts[0]?.id ?? 0);
        },
      },
    ]);
  };

  const reloadAccounts = React.useCallback(async () => {
    const [a, loans] = await Promise.all([getPaymentAccounts(), getOpenBorrowedLoans()]);
    setAccounts(a);
    setBorrowedLoans(loans);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refreshKey;
      void reloadAccounts();
    }, [reloadAccounts, refreshKey])
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, loans] = await Promise.all([getPaymentAccounts(), getOpenBorrowedLoans()]);
        if (cancelled) return;
        setAccounts(a);
        setBorrowedLoans(loans);
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
          setFundingMode(draft.fundingMode === 'borrowed' ? 'borrowed' : 'account');
          setLoanId(
            draft.loanId && loans.some((l) => l.id === draft.loanId) ? draft.loanId : 0
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

  const selectedLoan = borrowedLoans.find((l) => l.id === loanId);

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
    if (fundingMode === 'account' && !accountId) {
      Alert.alert(
        'Error',
        accounts.length === 0
          ? 'Add a bank or cash account in Banking first.'
          : 'Select a bank/cash account'
      );
      return;
    }
    if (fundingMode === 'borrowed' && !loanId) {
      Alert.alert(
        'Error',
        borrowedLoans.length === 0
          ? 'Add a borrowed entry in Lent & Borrowed first.'
          : 'Select a borrowed loan'
      );
      return;
    }
    setLoading(true);
    try {
      const id = await createExpense({
        category: category.trim(),
        description: description.trim(),
        amount: amt!,
        account_id: fundingMode === 'account' ? accountId : null,
        loan_id: fundingMode === 'borrowed' ? loanId : null,
        date,
        is_recurring: isRecurring,
        recurrence: isRecurring ? recurrence : undefined,
      });
      leaveBypassRef.current = true;
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
    <FormScreen
      stickyFooter={<DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />}
    >
      <SectionHeader title="New Expense" />
      <CategoryPicker value={category} onChange={setCategory} source={expenseCategorySource} />
      <FormInput label="Description" value={description} onChangeText={setDescription} />
      <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} money />
      <DatePickerField label="Date" value={date} onChange={setDate} />

      <Text style={[styles.label, { marginBottom: spacing.xs }]}>Paid from</Text>
      <SegmentedControl options={FUNDING_OPTIONS} value={fundingMode} onChange={setFundingMode} />
      {fundingMode === 'borrowed' ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginVertical: spacing.sm }}>
          Cash unchanged; loan outstanding increases.
        </Text>
      ) : accounts.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginVertical: spacing.sm }}>
          Add a bank or cash account in Banking before recording expenses.
        </Text>
      ) : (
        <View style={{ height: spacing.sm }} />
      )}

      {fundingMode === 'account' ? (
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
      ) : (
        <InlineDropdown
          label="Borrowed loan"
          placeholder="Select borrowed loan"
          valueLabel={
            selectedLoan
              ? `${selectedLoan.lender_name} (${formatCurrency(selectedLoan.outstanding_amount)})`
              : undefined
          }
          open={loanPickerOpen}
          onOpenChange={setLoanPickerOpen}
          options={borrowedLoans.map((l) => ({
            key: String(l.id),
            value: l.id,
            label: l.lender_name,
            meta: formatCurrency(l.outstanding_amount),
          }))}
          selectedValue={loanId || null}
          onSelect={setLoanId}
          emptyText="No open borrowed loans"
        />
      )}

      <View style={[styles.row, { marginVertical: spacing.sm }]}>
        <Text style={styles.label}>Recurring Expense</Text>
        <ThemedSwitch
          value={isRecurring}
          onValueChange={setIsRecurring}
          accessibilityLabel="Recurring expense"
        />
      </View>
      {isRecurring ? (
        <View style={{ marginBottom: spacing.md }}>
          <SegmentedControl
            options={RECURRENCE_OPTIONS}
            value={recurrence as 'Monthly' | 'Weekly' | 'Yearly'}
            onChange={setRecurrence}
          />
        </View>
      ) : null}

      <PrimaryButton title="Save Expense" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

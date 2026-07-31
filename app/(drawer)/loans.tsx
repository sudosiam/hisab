import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DatePickerField,
  EmptyState,
  ErrorState,
  Fab,
  FormInput,
  PrimaryButton,
  SearchField,
  SectionHeader,
  SegmentedControl,
  SummaryHero,
  ThemedPressable,
  useFabListPadding,
  useScreenStyles,
} from '../../src/components/ui';
import { AccountPicker } from '../../src/components/AccountPicker';
import { ListItem } from '../../src/components/ListItem';
import { ListSkeleton } from '../../src/components/Skeleton';
import {
  borrowMoney,
  collectLent,
  deleteLoan,
  getLoans,
  lendMoney,
  repayBorrow,
  updateLoan,
} from '../../src/services/loans';
import { getPaymentAccounts } from '../../src/services/banking';
import {
  formatAmountInput,
  formatCurrency,
  parseAmountInput,
  parsePositiveAmount,
  parseMoneyInput,
} from '../../src/utils/format';
import { matchesSearch } from '../../src/utils/search';
import { isValidISODate, todayISO } from '../../src/utils/date';
import { useDatabaseActions, useRefreshKey } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../src/db/database';
import { spacing } from '../../src/constants/theme';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../src/constants/listPerf';
import { cardSurface } from '../../src/constants/shadows';
import type { Account, Loan, LoanDirection } from '../../src/types';

type FilterChip = 'all' | LoanDirection;
type FieldErrors = {
  lenderName?: string;
  principalAmount?: string;
  outstandingAmount?: string;
  interestRate?: string;
  startDate?: string;
  accountId?: string;
  settleAmount?: string;
  settleAccount?: string;
  settleDate?: string;
};

const FILTER_OPTIONS: { value: FilterChip; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'lent', label: 'Lent' },
  { value: 'borrowed', label: 'Borrowed' },
];

const DIRECTION_OPTIONS: { value: LoanDirection; label: string }[] = [
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'lent', label: 'Lent' },
];

export default function LoansScreen() {
  const styles = useScreenStyles();
  const insets = useSafeAreaInsets();
  const fabListPadding = useFabListPadding();
  const { colors, isDark } = useTheme();
  const { refresh } = useDatabaseActions();
  const refreshKey = useRefreshKey();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<FilterChip>('all');
  const [showForm, setShowForm] = useState(false);
  const [settleLoan, setSettleLoan] = useState<Loan | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [direction, setDirection] = useState<LoanDirection>('borrowed');
  const [lenderName, setLenderName] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [outstandingAmount, setOutstandingAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState(0);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleAccountId, setSettleAccountId] = useState(0);
  const [settleDate, setSettleDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const savedFormSnapshotRef = useRef<string | null>(null);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        editingId,
        direction,
        lenderName,
        principalAmount,
        outstandingAmount,
        interestRate,
        startDate,
        notes,
        accountId,
        settleLoanId: settleLoan?.id ?? null,
        settleAmount,
        settleAccountId,
        settleDate,
      }),
    [
      editingId,
      direction,
      lenderName,
      principalAmount,
      outstandingAmount,
      interestRate,
      startDate,
      notes,
      accountId,
      settleLoan,
      settleAmount,
      settleAccountId,
      settleDate,
    ]
  );
  const formDirty =
    (showForm || settleLoan !== null) &&
    savedFormSnapshotRef.current !== null &&
    formSnapshot !== savedFormSnapshotRef.current;
  useUnsavedChangesGuard(formDirty);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        form: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.lg,
          gap: spacing.xs,
        },
        actionTap: {
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
          minHeight: 44,
          minWidth: 64,
          justifyContent: 'center',
          alignItems: 'flex-end',
        },
        headerRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
          marginBottom: spacing.xs,
        },
        heroes: { gap: spacing.sm, marginBottom: spacing.md },
        hint: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm },
        rowActions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    const [loanRows, paymentAccounts] = await Promise.all([getLoans(), getPaymentAccounts()]);
    setLoans(loanRows);
    setAccounts(paymentAccounts);
    if (!accountId && paymentAccounts[0]) setAccountId(paymentAccounts[0].id);
    if (!settleAccountId && paymentAccounts[0]) setSettleAccountId(paymentAccounts[0].id);
    setError(null);
  }, [accountId, settleAccountId]);

  const formOpenRef = useRef(false);
  formOpenRef.current = showForm || settleLoan !== null;

  const { booting, error: loadError, retry } = useFocusRefresh(async () => {
    if (!formOpenRef.current) await load();
  }, [refreshKey]);

  const totalLent = useMemo(
    () =>
      loans
        .filter((l) => l.direction === 'lent')
        .reduce((sum, loan) => sum + loan.outstanding_amount, 0),
    [loans]
  );
  const totalBorrowed = useMemo(
    () =>
      loans
        .filter((l) => l.direction !== 'lent')
        .reduce((sum, loan) => sum + loan.outstanding_amount, 0),
    [loans]
  );

  const filteredLoans = useMemo(() => {
    const byDir =
      filter === 'all' ? loans : loans.filter((l) => (l.direction ?? 'borrowed') === filter);
    return byDir.filter((item) =>
      matchesSearch(search, [
        item.lender_name,
        item.notes,
        item.outstanding_amount,
        item.start_date,
        item.direction,
      ])
    );
  }, [filter, loans, search]);

  const resetForm = () => {
    setLenderName('');
    setPrincipalAmount('');
    setOutstandingAmount('');
    setInterestRate('');
    setStartDate('');
    setNotes('');
    setDirection('borrowed');
    setEditingId(null);
    setShowForm(false);
    setSettleLoan(null);
    setSettleAmount('');
    setSettleDate(todayISO());
    setFieldErrors({});
    savedFormSnapshotRef.current = null;
  };

  const startAdd = () => {
    const blank = {
      editingId: null as number | null,
      direction: 'borrowed' as LoanDirection,
      lenderName: '',
      principalAmount: '',
      outstandingAmount: '',
      interestRate: '',
      startDate: '',
      notes: '',
      accountId: accounts[0]?.id ?? 0,
      settleLoanId: null as number | null,
      settleAmount: '',
      settleAccountId: accounts[0]?.id ?? 0,
      settleDate: todayISO(),
    };
    setSettleLoan(null);
    setEditingId(blank.editingId);
    setDirection(blank.direction);
    setLenderName(blank.lenderName);
    setPrincipalAmount(blank.principalAmount);
    setOutstandingAmount(blank.outstandingAmount);
    setInterestRate(blank.interestRate);
    setStartDate(blank.startDate);
    setNotes(blank.notes);
    setAccountId(blank.accountId);
    setShowForm(true);
    savedFormSnapshotRef.current = JSON.stringify(blank);
  };

  const startEdit = useCallback((loan: Loan) => {
    const next = {
      editingId: loan.id as number | null,
      direction: (loan.direction ?? 'borrowed') as LoanDirection,
      lenderName: loan.lender_name,
      principalAmount: formatAmountInput(loan.principal_amount),
      outstandingAmount: formatAmountInput(loan.outstanding_amount),
      interestRate:
        loan.interest_rate === null || Number.isNaN(loan.interest_rate)
          ? ''
          : String(loan.interest_rate),
      startDate: loan.start_date ?? '',
      notes: loan.notes ?? '',
      accountId,
      settleLoanId: null as number | null,
      settleAmount: '',
      settleAccountId,
      settleDate: todayISO(),
    };
    setSettleLoan(null);
    setEditingId(next.editingId);
    setDirection(next.direction);
    setLenderName(next.lenderName);
    setPrincipalAmount(next.principalAmount);
    setOutstandingAmount(next.outstandingAmount);
    setInterestRate(next.interestRate);
    setStartDate(next.startDate);
    setNotes(next.notes);
    setShowForm(true);
    savedFormSnapshotRef.current = JSON.stringify(next);
  }, [accountId, settleAccountId]);

  const startSettle = useCallback((loan: Loan) => {
    setShowForm(false);
    setEditingId(null);
    setSettleLoan(loan);
    setSettleAmount(formatAmountInput(loan.outstanding_amount));
    setSettleDate(todayISO());
    setSettleAccountId(accounts[0]?.id ?? 0);
    setFieldErrors({});
    savedFormSnapshotRef.current = JSON.stringify({
      editingId: null,
      direction,
      lenderName: '',
      principalAmount: '',
      outstandingAmount: '',
      interestRate: '',
      startDate: '',
      notes: '',
      accountId,
      settleLoanId: loan.id,
      settleAmount: formatAmountInput(loan.outstanding_amount),
      settleAccountId: accounts[0]?.id ?? 0,
      settleDate: todayISO(),
    });
  }, [accounts, direction, accountId]);

  const handleSave = async () => {
    if (saving) return;

    const nextErrors: FieldErrors = {};
    const principal = parsePositiveAmount(principalAmount);
    const nameLabel = direction === 'lent' ? 'borrower' : 'lender';
    if (!lenderName.trim()) nextErrors.lenderName = `Enter ${nameLabel} name`;
    if (principal === null) nextErrors.principalAmount = 'Enter an amount greater than zero';

    if (editingId) {
      const outstanding = parseMoneyInput(outstandingAmount || '0');
      if (!Number.isFinite(outstanding) || outstanding < 0) {
        nextErrors.outstandingAmount = 'Cannot be negative';
      } else if (principal !== null && outstanding > principal) {
        nextErrors.outstandingAmount = 'Cannot exceed principal';
      }
    }

    const rate = interestRate.trim() === '' ? undefined : parseAmountInput(interestRate);
    if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) {
      nextErrors.interestRate = 'Must be a valid positive number';
    }
    if (startDate.trim() && !isValidISODate(startDate.trim())) {
      nextErrors.startDate = 'Use YYYY-MM-DD format';
    }
    if (!editingId && direction === 'lent' && !accountId) {
      nextErrors.accountId = 'Select a cash/bank account';
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      if (editingId) {
        await updateLoan(editingId, {
          lender_name: lenderName.trim(),
          principal_amount: principal!,
          outstanding_amount: parseMoneyInput(outstandingAmount || '0'),
          interest_rate: rate,
          start_date: startDate.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else if (direction === 'lent') {
        await lendMoney({
          lender_name: lenderName.trim(),
          principal_amount: principal!,
          account_id: accountId,
          interest_rate: rate,
          start_date: startDate.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await borrowMoney({
          lender_name: lenderName.trim(),
          principal_amount: principal!,
          outstanding_amount: principal!,
          interest_rate: rate,
          start_date: startDate.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      refresh();
      resetForm();
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSettle = async () => {
    if (saving || !settleLoan) return;
    const nextErrors: FieldErrors = {};
    const amt = parsePositiveAmount(settleAmount);
    if (amt === null) nextErrors.settleAmount = 'Enter an amount greater than zero';
    if (!settleAccountId) nextErrors.settleAccount = 'Select a cash/bank account';
    if (!isValidISODate(settleDate)) nextErrors.settleDate = 'Select a valid date';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      if (settleLoan.direction === 'lent') {
        await collectLent({
          loanId: settleLoan.id,
          account_id: settleAccountId,
          amount: amt!,
          date: settleDate,
        });
      } else {
        await repayBorrow({
          loanId: settleLoan.id,
          account_id: settleAccountId,
          amount: amt!,
          date: settleDate,
        });
      }
      refresh();
      resetForm();
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(
    (loan: Loan) => {
      const isLent = loan.direction === 'lent';
      Alert.alert(
        isLent ? 'Delete Money Lent' : 'Delete Borrowed',
        `Remove ${loan.lender_name}?\nOutstanding ${formatCurrency(loan.outstanding_amount)} will leave the balance sheet.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteLoan(loan.id);
                refresh();
                await load();
              } catch (e) {
                Alert.alert('Error', formatSqliteError(e));
              }
            },
          },
        ]
      );
    },
    [load, refresh]
  );

  const renderLoanItem = useCallback(
    ({ item: loan }: { item: Loan }) => {
      const isLent = loan.direction === 'lent';
      return (
        <ListItem
          title={loan.lender_name}
          subtitle={`${isLent ? 'Lent' : 'Borrowed'} · Outstanding ${formatCurrency(loan.outstanding_amount)} · Principal ${formatCurrency(loan.principal_amount)}${loan.interest_rate !== null ? ` · ${loan.interest_rate}%` : ''}${loan.start_date ? ` · from ${loan.start_date}` : ''}`}
          meta={loan.notes ?? undefined}
          amount={loan.outstanding_amount}
          amountColor={isLent ? colors.success : colors.danger}
          onPress={() => startEdit(loan)}
          trailing={
            <View style={localStyles.rowActions}>
              {loan.outstanding_amount > 0 ? (
                <ThemedPressable
                  style={localStyles.actionTap}
                  onPress={() => startSettle(loan)}
                  accessibilityRole="button"
                  accessibilityLabel={isLent ? `Collect from ${loan.lender_name}` : `Repay ${loan.lender_name}`}
                  hitSlop={6}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                    {isLent ? 'Collect' : 'Repay'}
                  </Text>
                </ThemedPressable>
              ) : null}
              <ThemedPressable
                style={localStyles.actionTap}
                onPress={() => handleDelete(loan)}
                haptic="warning"
                accessibilityRole="button"
                accessibilityLabel={`Delete ${loan.lender_name}`}
                hitSlop={6}
              >
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Delete</Text>
              </ThemedPressable>
            </View>
          }
          accessibilityLabel={`Edit ${isLent ? 'lent' : 'borrowed'} ${loan.lender_name}`}
        />
      );
    },
    [colors.danger, colors.primary, colors.success, handleDelete, localStyles.actionTap, localStyles.rowActions, startEdit, startSettle]
  );

  const listHeader = (
    <>
      <View style={localStyles.heroes}>
        <SummaryHero
          label="Money Lent Outstanding"
          amount={totalLent}
          hint={`${loans.filter((l) => l.direction === 'lent').length} lent`}
        />
        <SummaryHero
          label="Borrowed Outstanding"
          amount={totalBorrowed}
          hint={`${loans.filter((l) => l.direction !== 'lent').length} borrowed`}
        />
      </View>

      <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />

      <View style={localStyles.headerRow}>
        <SectionHeader title="Lent & Borrowed" />
        {showForm || settleLoan ? (
          <ThemedPressable
            onPress={resetForm}
            accessibilityRole="button"
            accessibilityLabel="Cancel form"
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}
          >
            <Text style={styles.link}>Cancel</Text>
          </ThemedPressable>
        ) : null}
      </View>

      <SearchField value={search} onChangeText={setSearch} placeholder="Search name or notes..." />

      {settleLoan ? (
        <View style={localStyles.form}>
          <Text style={styles.cardTitle}>
            {settleLoan.direction === 'lent' ? 'Collect' : 'Repay'} — {settleLoan.lender_name}
          </Text>
          <Text style={localStyles.hint}>
            Outstanding {formatCurrency(settleLoan.outstanding_amount)}. Cash/bank will{' '}
            {settleLoan.direction === 'lent' ? 'increase' : 'decrease'}.
          </Text>
          <FormInput
            label="Amount (₹)"
            value={settleAmount}
            onChangeText={(v) => {
              setSettleAmount(v);
              if (fieldErrors.settleAmount) setFieldErrors((e) => ({ ...e, settleAmount: undefined }));
            }}
            money
            error={fieldErrors.settleAmount}
          />
          <DatePickerField
            label="Date"
            value={settleDate}
            onChange={(v) => {
              setSettleDate(v);
              if (fieldErrors.settleDate) setFieldErrors((e) => ({ ...e, settleDate: undefined }));
            }}
            error={fieldErrors.settleDate}
          />
          <AccountPicker
            accounts={accounts}
            value={settleAccountId}
            onChange={(id) => {
              setSettleAccountId(id);
              if (fieldErrors.settleAccount) setFieldErrors((e) => ({ ...e, settleAccount: undefined }));
            }}
          />
          {fieldErrors.settleAccount ? (
            <Text style={{ color: colors.danger, fontSize: 12 }}>{fieldErrors.settleAccount}</Text>
          ) : null}
          <PrimaryButton
            title={settleLoan.direction === 'lent' ? 'Collect' : 'Repay'}
            onPress={handleSettle}
            loading={saving}
          />
        </View>
      ) : null}

      {showForm ? (
        <View style={localStyles.form}>
          <Text style={styles.cardTitle}>
            {editingId ? 'Edit Entry' : 'New Entry'}
          </Text>
          {!editingId ? (
            <SegmentedControl
              options={DIRECTION_OPTIONS}
              value={direction}
              onChange={setDirection}
            />
          ) : null}
          <Text style={localStyles.hint}>
            {editingId
              ? 'Adjust principal and outstanding as needed.'
              : direction === 'lent'
                ? 'Cash/bank decreases; receivable increases.'
                : 'Cash unchanged; liability outstanding increases.'}
          </Text>
          <FormInput
            label={direction === 'lent' ? 'Borrower Name' : 'Lender Name'}
            value={lenderName}
            onChangeText={(v) => {
              setLenderName(v);
              if (fieldErrors.lenderName) setFieldErrors((e) => ({ ...e, lenderName: undefined }));
            }}
            placeholder={direction === 'lent' ? 'Friend, relative...' : 'Bank, friend, NBFC...'}
            error={fieldErrors.lenderName}
          />
          <FormInput
            label="Amount (₹)"
            value={principalAmount}
            onChangeText={(v) => {
              setPrincipalAmount(v);
              if (!editingId) setOutstandingAmount(v);
              if (fieldErrors.principalAmount) {
                setFieldErrors((e) => ({ ...e, principalAmount: undefined }));
              }
            }}
            money
            error={fieldErrors.principalAmount}
          />
          {editingId ? (
            <FormInput
              label="Outstanding Amount (₹)"
              value={outstandingAmount}
              onChangeText={(v) => {
                setOutstandingAmount(v);
                if (fieldErrors.outstandingAmount) {
                  setFieldErrors((e) => ({ ...e, outstandingAmount: undefined }));
                }
              }}
              money
              error={fieldErrors.outstandingAmount}
            />
          ) : null}
          <FormInput
            label="Interest Rate (%)"
            value={interestRate}
            onChangeText={(v) => {
              setInterestRate(v);
              if (fieldErrors.interestRate) setFieldErrors((e) => ({ ...e, interestRate: undefined }));
            }}
            qty
            placeholder="Optional"
            error={fieldErrors.interestRate}
          />
          <DatePickerField
            label="Start Date"
            value={startDate}
            onChange={(v) => {
              setStartDate(v);
              if (fieldErrors.startDate) setFieldErrors((e) => ({ ...e, startDate: undefined }));
            }}
            error={fieldErrors.startDate}
          />
          {!editingId && direction === 'lent' ? (
            <>
              <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
              {fieldErrors.accountId ? (
                <Text style={{ color: colors.danger, fontSize: 12 }}>{fieldErrors.accountId}</Text>
              ) : null}
            </>
          ) : null}
          <FormInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional details..."
          />
          <PrimaryButton
            title={editingId ? 'Save Changes' : direction === 'lent' ? 'Lend Money' : 'Add Borrowed'}
            onPress={handleSave}
            loading={saving}
          />
        </View>
      ) : null}
    </>
  );

  if (booting && loans.length === 0) {
    return (
      <View style={styles.container}>
        <ListSkeleton />
      </View>
    );
  }

  if (error || loadError) {
    return <ErrorState message={error ?? loadError ?? undefined} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: fabListPadding + Math.max(insets.bottom, spacing.md) },
        ]}
        data={filteredLoans}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderLoanItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load()
                .catch((e) => Alert.alert('Refresh failed', formatSqliteError(e)))
                .finally(() => setRefreshing(false));
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            title={search.trim() ? 'No matching entries' : 'No lent or borrowed yet'}
            message={
              search.trim()
                ? 'Try a different search.'
                : 'Track money you lent out or borrowed. Expenses and assets can also be funded by a borrow.'
            }
            actionLabel={search.trim() ? undefined : 'Add Entry'}
            onAction={search.trim() ? undefined : startAdd}
          />
        }
      />
      {!showForm && !settleLoan ? <Fab label="+ Add" onPress={startAdd} /> : null}
    </View>
  );
}

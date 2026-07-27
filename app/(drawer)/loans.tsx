import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DatePickerField,
  EmptyState,
  ErrorState,
  FormInput,
  PrimaryButton,
  SearchField,
  SectionHeader,
  SummaryHero,
  ThemedPressable,
  useScreenStyles,
} from '../../src/components/ui';
import { ListItem } from '../../src/components/ListItem';
import { ListSkeleton } from '../../src/components/Skeleton';
import { addLoan, deleteLoan, getLoans, updateLoan } from '../../src/services/loans';
import { formatAmountInput, formatCurrency, parseAmountInput, parsePositiveAmount } from '../../src/utils/format';
import { matchesSearch } from '../../src/utils/search';
import { isValidISODate } from '../../src/utils/date';
import { useDatabaseActions } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../src/db/database';
import { spacing } from '../../src/constants/theme';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../src/constants/listPerf';
import { cardSurface } from '../../src/constants/shadows';
import type { Loan } from '../../src/types';

type FieldErrors = {
  lenderName?: string;
  principalAmount?: string;
  outstandingAmount?: string;
  interestRate?: string;
  startDate?: string;
};

export default function LoansScreen() {
  const styles = useScreenStyles();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { refresh } = useDatabaseActions();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [lenderName, setLenderName] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [outstandingAmount, setOutstandingAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const savedFormSnapshotRef = useRef<string | null>(null);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        editingId,
        lenderName,
        principalAmount,
        outstandingAmount,
        interestRate,
        startDate,
        notes,
      }),
    [
      editingId,
      lenderName,
      principalAmount,
      outstandingAmount,
      interestRate,
      startDate,
      notes,
    ]
  );
  const formDirty =
    showForm &&
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
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    setLoans(await getLoans());
    setError(null);
  }, []);

  const formOpenRef = useRef(false);
  formOpenRef.current = showForm;

  const { booting, error: loadError, retry } = useFocusRefresh(
    async () => {
      if (!formOpenRef.current) await load();
    },
    []
  );

  const totalOutstanding = useMemo(
    () => loans.reduce((sum, loan) => sum + loan.outstanding_amount, 0),
    [loans]
  );

  const filteredLoans = useMemo(
    () =>
      loans.filter((item) =>
        matchesSearch(search, [item.lender_name, item.notes, item.outstanding_amount, item.start_date])
      ),
    [loans, search]
  );

  const resetForm = () => {
    setLenderName('');
    setPrincipalAmount('');
    setOutstandingAmount('');
    setInterestRate('');
    setStartDate('');
    setNotes('');
    setEditingId(null);
    setShowForm(false);
    setFieldErrors({});
    savedFormSnapshotRef.current = null;
  };

  const startAdd = () => {
    const blank = {
      editingId: null as number | null,
      lenderName: '',
      principalAmount: '',
      outstandingAmount: '',
      interestRate: '',
      startDate: '',
      notes: '',
    };
    setEditingId(blank.editingId);
    setLenderName(blank.lenderName);
    setPrincipalAmount(blank.principalAmount);
    setOutstandingAmount(blank.outstandingAmount);
    setInterestRate(blank.interestRate);
    setStartDate(blank.startDate);
    setNotes(blank.notes);
    setShowForm(true);
    savedFormSnapshotRef.current = JSON.stringify(blank);
  };

  const startEdit = (loan: Loan) => {
    const next = {
      editingId: loan.id as number | null,
      lenderName: loan.lender_name,
      principalAmount: formatAmountInput(loan.principal_amount),
      outstandingAmount: formatAmountInput(loan.outstanding_amount),
      interestRate:
        loan.interest_rate === null || Number.isNaN(loan.interest_rate)
          ? ''
          : formatAmountInput(loan.interest_rate),
      startDate: loan.start_date ?? '',
      notes: loan.notes ?? '',
    };
    setEditingId(next.editingId);
    setLenderName(next.lenderName);
    setPrincipalAmount(next.principalAmount);
    setOutstandingAmount(next.outstandingAmount);
    setInterestRate(next.interestRate);
    setStartDate(next.startDate);
    setNotes(next.notes);
    setShowForm(true);
    savedFormSnapshotRef.current = JSON.stringify(next);
  };

  const handleSave = async () => {
    if (saving) return;

    const nextErrors: FieldErrors = {};
    const principal = parsePositiveAmount(principalAmount);
    if (!lenderName.trim()) nextErrors.lenderName = 'Enter lender name';
    if (principal === null) nextErrors.principalAmount = 'Enter an amount greater than zero';

    const outstanding = parseAmountInput(outstandingAmount || '0');
    if (!Number.isFinite(outstanding) || outstanding < 0) {
      nextErrors.outstandingAmount = 'Cannot be negative';
    } else if (principal !== null && outstanding > principal) {
      nextErrors.outstandingAmount = 'Cannot exceed principal';
    }

    const rate =
      interestRate.trim() === ''
        ? undefined
        : parseAmountInput(interestRate);
    if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) {
      nextErrors.interestRate = 'Must be a valid positive number';
    }
    if (startDate.trim() && !isValidISODate(startDate.trim())) {
      nextErrors.startDate = 'Use YYYY-MM-DD format';
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        lender_name: lenderName.trim(),
        principal_amount: principal!,
        outstanding_amount: outstanding,
        interest_rate: rate,
        start_date: startDate.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (editingId) {
        await updateLoan(editingId, payload);
      } else {
        await addLoan(payload);
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

  const handleDelete = useCallback((loan: Loan) => {
    Alert.alert('Delete Loan', `Remove loan from ${loan.lender_name}?\nThis removes ${formatCurrency(loan.outstanding_amount)} from balance sheet liabilities.`, [
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
    ]);
  }, [load, refresh]);

  const renderLoanItem = useCallback(
    ({ item: loan }: { item: Loan }) => (
      <ListItem
        title={loan.lender_name}
        subtitle={`Principal ${formatCurrency(loan.principal_amount)}${loan.interest_rate !== null ? ` · ${loan.interest_rate}%` : ''}${loan.start_date ? ` · ${loan.start_date}` : ''}`}
        meta={loan.notes ?? undefined}
        amount={loan.outstanding_amount}
        amountColor={colors.danger}
        onPress={() => startEdit(loan)}
        trailing={
          <ThemedPressable
            style={localStyles.actionTap}
            onPress={() => handleDelete(loan)}
            haptic="warning"
            accessibilityRole="button"
            accessibilityLabel={`Delete loan from ${loan.lender_name}`}
            hitSlop={6}
          >
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Delete</Text>
          </ThemedPressable>
        }
        accessibilityLabel={`Edit loan from ${loan.lender_name}`}
      />
    ),
    [colors.danger, handleDelete, localStyles.actionTap]
  );

  const listHeader = (
    <>
      <SummaryHero
        label="Total Outstanding Loans"
        amount={totalOutstanding}
        hint={`${loans.length} loan${loans.length === 1 ? '' : 's'}`}
      />

      <View style={localStyles.headerRow}>
        <SectionHeader title="Loans" />
        <ThemedPressable
          onPress={() => {
            if (showForm) {
              resetForm();
              return;
            }
            startAdd();
          }}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Cancel loan form' : 'Add loan'}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}
        >
          <Text style={styles.link}>{showForm ? 'Cancel' : '+ Add Loan'}</Text>
        </ThemedPressable>
      </View>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search lender or notes..."
      />

      {showForm ? (
        <View style={localStyles.form}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit Loan' : 'New Loan'}</Text>
          <FormInput
            label="Lender Name"
            value={lenderName}
            onChangeText={(v) => {
              setLenderName(v);
              if (fieldErrors.lenderName) setFieldErrors((e) => ({ ...e, lenderName: undefined }));
            }}
            placeholder="Bank name, friend, NBFC..."
            error={fieldErrors.lenderName}
          />
          <FormInput
            label="Principal Amount (₹)"
            value={principalAmount}
            onChangeText={(v) => {
              setPrincipalAmount(v);
              if (fieldErrors.principalAmount) {
                setFieldErrors((e) => ({ ...e, principalAmount: undefined }));
              }
            }}
            money
            error={fieldErrors.principalAmount}
          />
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
          <FormInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional details..."
          />
          <PrimaryButton title={editingId ? 'Save Changes' : 'Add Loan'} onPress={handleSave} loading={saving} />
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
    <FlatList
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + Math.max(insets.bottom, spacing.md) },
      ]}
      data={filteredLoans}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderLoanItem}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      getItemLayout={listCardGetItemLayout}
      {...FLATLIST_PERF}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <EmptyState
          title={search.trim() ? 'No matching loans' : 'No loans yet'}
          message={
            search.trim()
              ? 'Try a different search.'
              : 'Track lender balances for your balance sheet.'
          }
          actionLabel={search.trim() ? undefined : 'Add Loan'}
          onAction={search.trim() ? undefined : startAdd}
        />
      }
    />
  );
}

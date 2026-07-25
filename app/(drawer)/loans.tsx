import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import {
  DatePickerField,
  ErrorState,
  FormInput,
  FormScreen,
  PrimaryButton,
  SearchField,
  SectionHeader,
  useScreenStyles,
} from '../../src/components/ui';
import { MoneyText } from '../../src/components/MoneyText';
import { addLoan, deleteLoan, getLoans, updateLoan } from '../../src/services/loans';
import { formatAmountInput, formatCurrency, parseAmountInput, parsePositiveAmount } from '../../src/utils/format';
import { matchesSearch } from '../../src/utils/search';
import { isValidISODate } from '../../src/utils/date';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../src/db/database';
import { spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { Loan } from '../../src/types';

export default function LoansScreen() {
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const { refresh } = useDatabase();
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
        hero: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginBottom: spacing.lg,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textSecondary, textTransform: 'uppercase' },
        heroValueWrap: { width: '100%', marginTop: spacing.sm, paddingHorizontal: spacing.sm },
        loanCard: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.xs + 2,
          minHeight: 52,
          overflow: 'visible',
        },
        lenderName: { fontSize: 14, fontWeight: '600', color: colors.text },
        amountCol: { flexShrink: 1, minWidth: 88, maxWidth: '48%', alignItems: 'flex-end' },
        rowMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
        actionTap: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          minHeight: 40,
          justifyContent: 'center',
        },
        form: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.lg,
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

    const principal = parsePositiveAmount(principalAmount);
    if (!lenderName.trim() || principal === null) {
      Alert.alert('Error', 'Enter lender name and principal amount greater than zero');
      return;
    }

    const outstanding = parseAmountInput(outstandingAmount || '0');
    if (!Number.isFinite(outstanding) || outstanding < 0) {
      Alert.alert('Error', 'Outstanding amount cannot be negative');
      return;
    }
    if (outstanding > principal) {
      Alert.alert('Error', 'Outstanding amount cannot exceed the principal');
      return;
    }

    const rate =
      interestRate.trim() === ''
        ? undefined
        : parseAmountInput(interestRate);
    if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) {
      Alert.alert('Error', 'Interest rate must be a valid positive number');
      return;
    }
    if (startDate.trim() && !isValidISODate(startDate.trim())) {
      Alert.alert('Error', 'Start date must be in YYYY-MM-DD format');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        lender_name: lenderName.trim(),
        principal_amount: principal,
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

  const handleDelete = (loan: Loan) => {
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
  };

  if (booting && loans.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || loadError) {
    return <ErrorState message={error ?? loadError ?? undefined} onRetry={retry} />;
  }

  return (
    <FormScreen>
      <View style={localStyles.hero}>
        <Text style={localStyles.heroLabel}>Total Outstanding Loans</Text>
        <View style={localStyles.heroValueWrap}>
          <MoneyText
            amount={totalOutstanding}
            size="hero"
            style={{ width: '100%', textAlign: 'center' }}
          />
        </View>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13 }}>
          {loans.length} loan{loans.length === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHeader title="Loans" />
        <TouchableOpacity
          onPress={() => {
            if (showForm) {
              resetForm();
              return;
            }
            startAdd();
          }}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Cancel loan form' : 'Add loan'}
        >
          <Text style={styles.link}>{showForm ? 'Cancel' : '+ Add Loan'}</Text>
        </TouchableOpacity>
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
            onChangeText={setLenderName}
            placeholder="Bank name, friend, NBFC..."
          />
          <FormInput label="Principal Amount (₹)" value={principalAmount} onChangeText={setPrincipalAmount} money />
          <FormInput
            label="Outstanding Amount (₹)"
            value={outstandingAmount}
            onChangeText={setOutstandingAmount}
            money
          />
          <FormInput
            label="Interest Rate (%)"
            value={interestRate}
            onChangeText={setInterestRate}
            qty
            placeholder="Optional"
          />
          <DatePickerField
            label="Start Date"
            value={startDate}
            onChange={setStartDate}
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

      {filteredLoans.length === 0 ? (
        <Text style={styles.empty}>
          {search.trim()
            ? 'No loans match your search.'
            : 'No loans yet. Add one from the button above.'}
        </Text>
      ) : (
        filteredLoans.map((loan) => (
          <TouchableOpacity
            key={loan.id}
            style={localStyles.loanCard}
            onPress={() => startEdit(loan)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Edit loan from ${loan.lender_name}`}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={localStyles.lenderName} numberOfLines={2}>
                  {loan.lender_name}
                </Text>
                <Text style={localStyles.rowMeta} numberOfLines={2}>
                  Principal {formatCurrency(loan.principal_amount)}
                  {loan.interest_rate !== null ? ` · ${loan.interest_rate}%` : ''}
                  {loan.start_date ? ` · ${loan.start_date}` : ''}
                </Text>
                {loan.notes ? (
                  <Text style={localStyles.rowMeta} numberOfLines={2}>
                    {loan.notes}
                  </Text>
                ) : null}
              </View>
              <View style={localStyles.amountCol}>
                <MoneyText
                  amount={loan.outstanding_amount}
                  size="md"
                  color={colors.danger}
                  style={{ width: '100%' }}
                />
              </View>
            </View>
            <View style={localStyles.actions}>
              <TouchableOpacity
                style={localStyles.actionTap}
                onPress={() => startEdit(loan)}
                accessibilityRole="button"
                accessibilityLabel={`Edit loan from ${loan.lender_name}`}
              >
                <Text style={styles.link}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={localStyles.actionTap}
                onPress={() => handleDelete(loan)}
                accessibilityRole="button"
                accessibilityLabel={`Delete loan from ${loan.lender_name}`}
              >
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))
      )}
    </FormScreen>
  );
}

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
import { InlineDropdown } from '../../src/components/InlineDropdown';
import { ListItem } from '../../src/components/ListItem';
import { ListSkeleton } from '../../src/components/Skeleton';
import {
  addFixedAsset,
  deleteFixedAsset,
  getFixedAssets,
  getPaymentAccounts,
  updateFixedAsset,
} from '../../src/services/banking';
import { getOpenBorrowedLoans } from '../../src/services/loans';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../src/utils/format';
import { matchesSearch } from '../../src/utils/search';
import { todayISO, isValidISODate } from '../../src/utils/date';
import { useTheme } from '../../src/context/ThemeContext';
import { useDatabaseActions, useRefreshKey } from '../../src/context/DatabaseContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../src/db/database';
import { spacing } from '../../src/constants/theme';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../src/constants/listPerf';
import { cardSurface } from '../../src/constants/shadows';
import type { Account, FixedAsset, Loan } from '../../src/types';

type PaidFrom = 'memo' | 'account' | 'borrowed';

type FieldErrors = {
  name?: string;
  value?: string;
  accountId?: string;
  loanId?: string;
  date?: string;
};

const PAID_FROM_OPTIONS: { value: PaidFrom; label: string }[] = [
  { value: 'memo', label: 'Memo only' },
  { value: 'account', label: 'Cash/Bank' },
  { value: 'borrowed', label: 'Borrowed' },
];

export default function OthersScreen() {
  const styles = useScreenStyles();
  const insets = useSafeAreaInsets();
  const fabListPadding = useFabListPadding();
  const { colors, isDark } = useTheme();
  const { refresh } = useDatabaseActions();
  const refreshKey = useRefreshKey();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [borrowedLoans, setBorrowedLoans] = useState<Loan[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('memo');
  const [accountId, setAccountId] = useState(0);
  const [loanId, setLoanId] = useState(0);
  const [assetDate, setAssetDate] = useState(todayISO());
  const [loanPickerOpen, setLoanPickerOpen] = useState(false);
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
        name,
        value,
        notes,
        paidFrom,
        accountId,
        loanId,
        assetDate,
      }),
    [editingId, name, value, notes, paidFrom, accountId, loanId, assetDate]
  );
  const formDirty =
    showAdd &&
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
        hint: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    const [rows, paymentAccounts, loans] = await Promise.all([
      getFixedAssets(),
      getPaymentAccounts(),
      getOpenBorrowedLoans(),
    ]);
    setAssets(rows);
    setAccounts(paymentAccounts);
    setBorrowedLoans(loans);
    if (!accountId && paymentAccounts[0]) setAccountId(paymentAccounts[0].id);
    setError(null);
  }, [accountId]);

  const formOpenRef = useRef(false);
  formOpenRef.current = showAdd;

  const { booting, error: loadError, retry } = useFocusRefresh(async () => {
    if (!formOpenRef.current) await load();
  }, [refreshKey]);

  const total = useMemo(() => assets.reduce((sum, a) => sum + a.value, 0), [assets]);

  const filteredAssets = useMemo(
    () => assets.filter((item) => matchesSearch(search, [item.name, item.notes, item.value])),
    [assets, search]
  );

  const resetForm = () => {
    setName('');
    setValue('');
    setNotes('');
    setPaidFrom('memo');
    setLoanId(0);
    setAssetDate(todayISO());
    setEditingId(null);
    setShowAdd(false);
    setFieldErrors({});
    savedFormSnapshotRef.current = null;
  };

  const startAdd = () => {
    const blank = {
      editingId: null as number | null,
      name: '',
      value: '',
      notes: '',
      paidFrom: 'memo' as PaidFrom,
      accountId: accounts[0]?.id ?? 0,
      loanId: 0,
      assetDate: todayISO(),
    };
    setEditingId(blank.editingId);
    setName(blank.name);
    setValue(blank.value);
    setNotes(blank.notes);
    setPaidFrom(blank.paidFrom);
    setAccountId(blank.accountId);
    setLoanId(blank.loanId);
    setAssetDate(blank.assetDate);
    setShowAdd(true);
    savedFormSnapshotRef.current = JSON.stringify(blank);
  };

  const startEdit = useCallback((asset: FixedAsset) => {
    const next = {
      editingId: asset.id as number | null,
      name: asset.name,
      value: formatAmountInput(asset.value),
      notes: asset.notes ?? '',
      paidFrom: (asset.paid_from ?? 'memo') as PaidFrom,
      accountId: asset.account_id ?? accounts[0]?.id ?? 0,
      loanId: asset.loan_id ?? 0,
      assetDate: asset.date ?? todayISO(),
    };
    setEditingId(next.editingId);
    setName(next.name);
    setValue(next.value);
    setNotes(next.notes);
    setPaidFrom(next.paidFrom);
    setAccountId(next.accountId);
    setLoanId(next.loanId);
    setAssetDate(next.assetDate);
    setShowAdd(true);
    savedFormSnapshotRef.current = JSON.stringify(next);
  }, [accounts]);

  const handleSave = async () => {
    if (saving) return;
    const nextErrors: FieldErrors = {};
    const parsed = parsePositiveAmount(value);
    if (!name.trim()) nextErrors.name = 'Enter asset name';
    if (parsed === null) nextErrors.value = 'Enter an amount greater than zero';
    if (!editingId) {
      if (paidFrom === 'account' && !accountId) nextErrors.accountId = 'Select a cash/bank account';
      if (paidFrom === 'borrowed' && !loanId) nextErrors.loanId = 'Select a borrowed loan';
      if ((paidFrom === 'account' || paidFrom === 'borrowed') && !isValidISODate(assetDate)) {
        nextErrors.date = 'Select a valid date';
      }
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      if (editingId) {
        await updateFixedAsset(editingId, {
          name: name.trim(),
          value: parsed!,
          notes: notes.trim() || undefined,
        });
      } else {
        await addFixedAsset({
          name: name.trim(),
          value: parsed!,
          notes: notes.trim() || undefined,
          paid_from: paidFrom,
          account_id: paidFrom === 'account' ? accountId : null,
          loan_id: paidFrom === 'borrowed' ? loanId : null,
          date: assetDate,
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
    (asset: FixedAsset) => {
      Alert.alert(
        'Delete Asset',
        `Remove ${asset.name}?\nThis removes ${formatCurrency(asset.value)} from the balance sheet.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteFixedAsset(asset.id);
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

  const paidFromLabel = (asset: FixedAsset): string => {
    if (asset.paid_from === 'account') return asset.account_name ? `Cash · ${asset.account_name}` : 'Cash/Bank';
    if (asset.paid_from === 'borrowed') {
      return asset.loan_name ? `Borrowed · ${asset.loan_name}` : 'Borrowed';
    }
    return 'Memo';
  };

  const renderAssetItem = useCallback(
    ({ item: asset }: { item: FixedAsset }) => (
      <ListItem
        title={asset.name}
        subtitle={`Value ${formatCurrency(asset.value)} · ${paidFromLabel(asset)} · ${(asset.date || asset.created_at).slice(0, 10)}`}
        meta={asset.notes ?? undefined}
        amount={asset.value}
        amountColor={colors.primary}
        onPress={() => startEdit(asset)}
        trailing={
          <ThemedPressable
            style={localStyles.actionTap}
            onPress={() => handleDelete(asset)}
            haptic="warning"
            accessibilityRole="button"
            accessibilityLabel={`Delete asset ${asset.name}`}
            hitSlop={6}
          >
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Delete</Text>
          </ThemedPressable>
        }
        accessibilityLabel={`Edit asset ${asset.name}`}
      />
    ),
    [colors.danger, colors.primary, handleDelete, localStyles.actionTap, startEdit]
  );

  const selectedLoan = borrowedLoans.find((l) => l.id === loanId);

  const listHeader = (
    <>
      <SummaryHero
        label="Fixed Assets Total"
        amount={total}
        hint={`${assets.length} asset${assets.length === 1 ? '' : 's'}`}
      />

      <View style={localStyles.headerRow}>
        <SectionHeader title="Fixed Assets" />
        {showAdd ? (
          <ThemedPressable
            onPress={resetForm}
            accessibilityRole="button"
            accessibilityLabel="Cancel asset form"
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}
          >
            <Text style={styles.link}>Cancel</Text>
          </ThemedPressable>
        ) : null}
      </View>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search asset name or notes..."
      />

      {showAdd ? (
        <View style={localStyles.form}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit Asset' : 'New Asset'}</Text>
          <FormInput
            label="Asset Name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
            }}
            placeholder="Vehicle, Equipment..."
            error={fieldErrors.name}
          />
          <FormInput
            label="Value (₹)"
            value={value}
            onChangeText={(v) => {
              setValue(v);
              if (fieldErrors.value) setFieldErrors((e) => ({ ...e, value: undefined }));
            }}
            money
            error={fieldErrors.value}
          />
          {!editingId ? (
            <>
              <Text style={[styles.label, { marginBottom: spacing.xs }]}>Paid from</Text>
              <SegmentedControl
                options={PAID_FROM_OPTIONS}
                value={paidFrom}
                onChange={setPaidFrom}
              />
              <Text style={localStyles.hint}>
                {paidFrom === 'memo'
                  ? 'Register only — cash and loans unchanged.'
                  : paidFrom === 'account'
                    ? 'Cash/bank decreases; asset increases.'
                    : 'Cash unchanged; loan outstanding increases.'}
              </Text>
              {(paidFrom === 'account' || paidFrom === 'borrowed') ? (
                <DatePickerField
                  label="Date"
                  value={assetDate}
                  onChange={(v) => {
                    setAssetDate(v);
                    if (fieldErrors.date) setFieldErrors((e) => ({ ...e, date: undefined }));
                  }}
                  error={fieldErrors.date}
                />
              ) : null}
              {paidFrom === 'account' ? (
                <>
                  <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
                  {fieldErrors.accountId ? (
                    <Text style={{ color: colors.danger, fontSize: 12 }}>{fieldErrors.accountId}</Text>
                  ) : null}
                </>
              ) : null}
              {paidFrom === 'borrowed' ? (
                <>
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
                    onSelect={(id) => {
                      setLoanId(id);
                      if (fieldErrors.loanId) setFieldErrors((e) => ({ ...e, loanId: undefined }));
                    }}
                    emptyText="No open borrowed loans"
                  />
                  {fieldErrors.loanId ? (
                    <Text style={{ color: colors.danger, fontSize: 12 }}>{fieldErrors.loanId}</Text>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <Text style={localStyles.hint}>
              Funding source stays as recorded ({paidFromLabel({
                id: 0,
                name: '',
                value: 0,
                notes: null,
                paid_from: paidFrom,
                account_id: accountId,
                loan_id: loanId,
                created_at: '',
                account_name: accounts.find((a) => a.id === accountId)?.name,
                loan_name: borrowedLoans.find((l) => l.id === loanId)?.lender_name,
              })}). Changing value adjusts cash or borrowed outstanding.
            </Text>
          )}
          <FormInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional details..."
          />
          <PrimaryButton
            title={editingId ? 'Save Changes' : 'Add Asset'}
            onPress={handleSave}
            loading={saving}
          />
        </View>
      ) : null}
    </>
  );

  if (booting && assets.length === 0) {
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
        data={filteredAssets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderAssetItem}
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
            title={search.trim() ? 'No matching assets' : 'No fixed assets yet'}
            message={
              search.trim()
                ? 'Try a different search.'
                : 'Track equipment and property. Pay from cash, borrow, or keep as a memo.'
            }
            actionLabel={search.trim() ? undefined : 'Add Asset'}
            onAction={search.trim() ? undefined : startAdd}
          />
        }
      />
      {!showAdd ? <Fab label="+ Add Asset" onPress={startAdd} /> : null}
    </View>
  );
}

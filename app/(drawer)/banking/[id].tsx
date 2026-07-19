import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import {
  FormInput,
  PrimaryButton,
  SectionHeader,
  SearchField,
  useScreenStyles,
} from '../../../src/components/ui';
import { StatCard } from '../../../src/components/StatCard';
import { LedgerTable } from '../../../src/components/LedgerTable';
import {
  deleteAccount,
  deleteTransaction,
  getAccountById,
  getTransactions,
  updateAccount,
  updateOpeningBalance,
} from '../../../src/services/banking';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { parseRouteId } from '../../../src/utils/route';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../../../src/utils/format';
import { roundMoney } from '../../../src/utils/money';
import { spacing, radius } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { transactionsToLedgerRows } from '../../../src/utils/ledgerRows';
import type { Account, Transaction } from '../../../src/types';

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const { colors, isDark } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
        },
        name: { fontSize: 20, fontWeight: '700', color: colors.text },
        badge: {
          alignSelf: 'flex-start',
          marginTop: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radius.full,
          backgroundColor: colors.chip,
          borderWidth: 1,
          borderColor: colors.border,
        },
        badgeText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
        kpiRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginVertical: spacing.md,
        },
        actions: {
          flexDirection: 'row',
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
          marginBottom: spacing.md,
        },
        actionBtn: {
          flex: 1,
          paddingVertical: 10,
          minHeight: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.success,
        },
        actionBtnAlt: {
          flex: 1,
          paddingVertical: 10,
          minHeight: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.danger,
        },
        actionText: { color: colors.text, fontWeight: '700', fontSize: 13 },
        actionTextAlt: { color: colors.danger, fontWeight: '700', fontSize: 13 },
        chip: {
          padding: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
        },
        chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { color: colors.text, fontSize: 14 },
        chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
        excludeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
          padding: spacing.md,
          ...cardSurface(colors, isDark),
        },
        excludeLabel: { fontWeight: '600', fontSize: 14, color: colors.text },
        excludeHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, maxWidth: '85%' },
        accountActions: {
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
          marginBottom: spacing.md,
        },
      }),
    [colors, isDark]
  );

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'cash' | 'bank'>('cash');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [isExcluded, setIsExcluded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountId = useMemo(() => parseRouteId(id), [id]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((item) =>
        matchesSearch(search, [item.description, item.date, item.type, item.amount])
      ),
    [transactions, search]
  );

  const ledgerRows = useMemo(
    () => transactionsToLedgerRows(filteredTransactions),
    [filteredTransactions]
  );

  const transactionById = useMemo(() => {
    const map = new Map<string, Transaction>();
    for (const tx of transactions) map.set(String(tx.id), tx);
    return map;
  }, [transactions]);

  const fillForm = (a: Account) => {
    setName(a.name);
    setType(a.type);
    setOpeningBalance(formatAmountInput(a.opening_balance ?? 0));
    setIsExcluded(!!a.is_excluded);
  };

  const load = useCallback(async () => {
    if (!accountId) {
      setError('Invalid account');
      setLoading(false);
      return;
    }
    try {
      const [a, t] = await Promise.all([getAccountById(accountId), getTransactions(accountId)]);
      setAccount(a);
      setTransactions(t);
      if (a) fillForm(a);
      setError(a ? null : 'Account not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

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
    if (!editing || !account) return false;
    const opening = parseAmountInput(openingBalance);
    return (
      name.trim() !== account.name ||
      type !== account.type ||
      isExcluded !== !!account.is_excluded ||
      roundTwo(opening) !== roundTwo(account.opening_balance ?? 0)
    );
  }, [editing, account, name, type, isExcluded, openingBalance]);
  useUnsavedChangesGuard(isEditDirty);

  const handleSaveEdit = async () => {
    if (!account || saving) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Account name is required');
      return;
    }
    const opening = parseAmountInput(openingBalance);
    if (!Number.isFinite(opening)) {
      Alert.alert('Error', 'Enter a valid opening balance');
      return;
    }
    setSaving(true);
    try {
      await updateAccount(account.id, {
        name: name.trim(),
        type,
        is_excluded: isExcluded,
      });
      if (roundTwo(opening) !== roundTwo(account.opening_balance ?? 0)) {
        await updateOpeningBalance(account.id, opening);
      }
      refresh();
      setEditing(false);
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleExcludeToggle = async (value: boolean) => {
    if (!account) return;
    const action = value ? 'Deactivate account' : 'Reactivate account';
    const message = value
      ? `"${account.name}" will be hidden from new payment pickers and excluded from totals. Existing transaction history stays visible.`
      : `"${account.name}" will be available for new payments and included in totals again.`;
    Alert.alert(action, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: value ? 'Deactivate' : 'Reactivate',
        onPress: async () => {
          const prev = isExcluded;
          setIsExcluded(value);
          try {
            await updateAccount(account.id, {
              name: account.name,
              type: account.type,
              is_excluded: value,
            });
            refresh();
            await load();
          } catch (e) {
            setIsExcluded(prev);
            Alert.alert('Account update failed', formatSqliteError(e));
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (!account) return;
    Alert.alert(
      'Delete Account',
      `Delete "${account.name}"?\nAccounts with transaction history are blocked from deletion. Use Deactivate to hide an account while keeping history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              refresh();
              router.back();
            } catch (e) {
              Alert.alert('Delete blocked', formatSqliteError(e));
            }
          },
        },
      ]
    );
  };

  const handleDelete = (tx: Transaction) => {
    Alert.alert(
      'Delete Transaction',
      `Reverse "${tx.description}"?\nThis will adjust the account balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(tx.id);
              refresh();
              setLoading(true);
              await load();
            } catch (e) {
              Alert.alert('Error', formatSqliteError(e));
            }
          },
        },
      ]
    );
  };

  const handleDeleteRow = (rowId: string) => {
    const tx = transactionById.get(rowId);
    if (!tx) return;
    handleDelete(tx);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !account) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Account not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  let totalIn = 0;
  let totalOut = 0;
  for (const t of transactions) {
    // Opening balance is shown separately in the subtitle — including it in
    // "Money In" would double-count it for the reader.
    if (t.type === 'opening') continue;
    if (t.amount >= 0) totalIn = roundMoney(totalIn + t.amount);
    else totalOut = roundMoney(totalOut + Math.abs(t.amount));
  }

  const listHeader = (
    <>
      <View style={localStyles.header}>
        {!editing ? (
          <>
            <Text style={localStyles.name}>{account.name}</Text>
            <Text style={{ color: colors.textSecondary, textTransform: 'capitalize' }}>
              {account.type} account
            </Text>
            {account.is_excluded ? (
              <View style={localStyles.badge}>
                <Text style={localStyles.badgeText}>Deactivated</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <FormInput label="Account Name" value={name} onChangeText={setName} />
            <Text style={styles.label}>Account Type</Text>
            {(['cash', 'bank'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[localStyles.chip, type === t && localStyles.chipActive]}
                onPress={() => setType(t)}
              >
                <Text style={type === t ? localStyles.chipTextActive : localStyles.chipText}>
                  {t === 'cash' ? 'Cash' : 'Bank'}
                </Text>
              </TouchableOpacity>
            ))}
            <FormInput
              label="Opening Balance (₹)"
              value={openingBalance}
              onChangeText={setOpeningBalance}
              money
            />
            <PrimaryButton title="Save Changes" onPress={handleSaveEdit} loading={saving} />
          </>
        )}

        {!editing ? (
          <View style={localStyles.kpiRow}>
            <StatCard label="Balance" value={account.current_balance} color={colors.primary} />
            <StatCard
              label="Money In"
              value={totalIn}
              color={colors.success}
              subtitle={`Opening ${formatCurrency(account.opening_balance)}`}
            />
            <StatCard
              label="Money Out"
              value={totalOut}
              color={colors.danger}
              subtitle={`${transactions.length} transactions`}
            />
          </View>
        ) : null}
      </View>

      {!editing ? (
        <View style={localStyles.excludeRow}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Text style={localStyles.excludeLabel}>
              {isExcluded ? 'Account deactivated' : 'Deactivate this account'}
            </Text>
            <Text style={localStyles.excludeHint}>
              Deactivated accounts are hidden from new payment pickers and excluded from totals. History remains visible.
            </Text>
          </View>
          <Switch
            value={isExcluded}
            onValueChange={handleExcludeToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            accessibilityLabel={isExcluded ? 'Reactivate account' : 'Deactivate account'}
          />
        </View>
      ) : null}

      {!editing ? (
        <View style={localStyles.actions}>
          <TouchableOpacity
            style={localStyles.actionBtn}
            onPress={() => router.push(`/(drawer)/banking/cash?mode=deposit&accountId=${account.id}` as never)}
          >
            <Text style={localStyles.actionText}>Deposit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={localStyles.actionBtnAlt}
            onPress={() => router.push(`/(drawer)/banking/cash?mode=withdraw&accountId=${account.id}` as never)}
          >
            <Text style={localStyles.actionTextAlt}>Withdraw</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={localStyles.accountActions}>
        <PrimaryButton
          title={editing ? 'Cancel Edit' : 'Edit Account'}
          onPress={() => {
            if (editing && account) fillForm(account);
            setEditing(!editing);
          }}
          variant="secondary"
        />
        <PrimaryButton title="Delete Account" onPress={handleDeleteAccount} variant="danger" />
      </View>

      <SectionHeader title="Account Ledger" />

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search description, date, type..."
      />
    </>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {listHeader}

      <Text style={{ marginHorizontal: spacing.md, marginBottom: spacing.xs, fontSize: 12, color: colors.textSecondary }}>
        Long-press a row to delete a transaction.
      </Text>

      <View style={{ paddingHorizontal: spacing.md }}>
        <LedgerTable
          rows={ledgerRows}
          emptyText={
            search.trim() ? 'No transactions match your search.' : 'No transactions for this account'
          }
          onRowLongPress={(row) => handleDeleteRow(row.id)}
          rowActionHint="Long-press to delete"
        />
      </View>
    </ScrollView>
  );
}

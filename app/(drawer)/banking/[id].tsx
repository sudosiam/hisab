import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { useScreenStyles, SectionHeader, SearchField } from '../../../src/components/ui';
import {
  deleteTransaction,
  getAccountById,
  getTransactions,
} from '../../../src/services/banking';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { parseRouteId } from '../../../src/utils/route';
import { spacing, radius, typography } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account, Transaction } from '../../../src/types';

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
          ...cardSurface(colors, isDark),
          margin: spacing.md,
          padding: spacing.lg,
        },
        name: { ...typography.title, color: colors.text },
        balance: { ...typography.display, color: colors.primary, marginTop: spacing.sm },
        txRow: {
          ...cardSurface(colors, isDark),
          flexDirection: 'row',
          alignItems: 'center',
          padding: spacing.md,
          marginHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        txDesc: { fontWeight: '600', fontSize: 14, color: colors.text },
        txMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        txAmount: { fontWeight: '700', color: colors.success, marginRight: spacing.sm },
        neg: { color: colors.danger },
        deleteBtn: { padding: spacing.sm },
        deleteText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
        actions: {
          flexDirection: 'row',
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
          marginBottom: spacing.md,
        },
        actionBtn: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: radius.md,
          alignItems: 'center',
          backgroundColor: colors.success,
        },
        actionBtnAlt: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: radius.md,
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.danger,
        },
        actionText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
        actionTextAlt: { color: colors.danger, fontWeight: '700', fontSize: 13 },
      }),
    [colors, isDark]
  );

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accountId = useMemo(() => parseRouteId(id), [id]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((item) =>
        matchesSearch(search, [item.description, item.date, item.type, item.amount])
      ),
    [transactions, search]
  );

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
      setError(a ? null : 'Account not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

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

  return (
    <View style={styles.container}>
      <View style={localStyles.header}>
        <Text style={localStyles.name}>{account.name}</Text>
        <Text style={{ color: colors.textSecondary, textTransform: 'capitalize' }}>{account.type} account</Text>
        <Text style={localStyles.balance}>{formatCurrency(account.current_balance)}</Text>
      </View>

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

      <SectionHeader title="Transaction History" />

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search description, date, type..."
      />

      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search.trim() ? 'No transactions match your search.' : 'No transactions for this account'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={localStyles.txRow}>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.txDesc}>{item.description}</Text>
              <Text style={localStyles.txMeta}>{item.date} · {item.type}</Text>
            </View>
            <Text style={[localStyles.txAmount, item.amount < 0 && localStyles.neg]}>
              {item.amount >= 0 ? '+' : ''}{formatCurrency(item.amount)}
            </Text>
            <TouchableOpacity style={localStyles.deleteBtn} onPress={() => handleDelete(item)}>
              <Text style={localStyles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

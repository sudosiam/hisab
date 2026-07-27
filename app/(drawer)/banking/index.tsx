import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ListItem } from '../../../src/components/ListItem';
import { ListSkeleton } from '../../../src/components/Skeleton';
import {
  ErrorState,
  EmptyState,
  PrimaryButton,
  SearchField,
  SummaryHero,
  useScreenStyles,
} from '../../../src/components/ui';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { getAccounts, getTotalBalance } from '../../../src/services/banking';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing, radius } from '../../../src/constants/theme';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';
import type { Account } from '../../../src/types';

export default function BankingScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        heroWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
        actions: {
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
          gap: spacing.sm,
        },
        linkRow: {
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: spacing.sm,
        },
        outlineLink: {
          flex: 1,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          minHeight: 44,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          justifyContent: 'center',
          alignItems: 'center',
        },
        linkText: {
          color: colors.primary,
          fontWeight: '600',
          fontSize: 13,
          textAlign: 'center',
        },
      }),
    [colors]
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredAccounts = useMemo(
    () => accounts.filter((item) => matchesSearch(search, [item.name, item.type])),
    [accounts, search]
  );

  const load = useCallback(async () => {
    const [a, total] = await Promise.all([getAccounts(), getTotalBalance()]);
    setAccounts(a);
    setTotalBalance(total);
  }, []);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey]);

  const renderAccountItem = useCallback(
    ({ item }: { item: Account }) => (
      <ListItem
        title={item.name}
        subtitle={item.type}
        amount={item.current_balance}
        amountColor={item.is_excluded ? colors.textMuted : undefined}
        pill={item.is_excluded ? 'Deactivated' : undefined}
        pillTone="muted"
        onPress={() => router.push(`/(drawer)/banking/${item.id}` as never)}
        accessibilityLabel={`Open account ${item.name}`}
      />
    ),
    [colors.textMuted, router]
  );

  if (error && accounts.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.heroWrap}>
        <SummaryHero
          label="Total Balance"
          amount={totalBalance}
        />
      </View>

      <View style={localStyles.actions}>
        <PrimaryButton
          title="+ Add Account"
          onPress={() => router.push('/(drawer)/banking/add-account' as never)}
        />
        <View style={localStyles.linkRow}>
          <TouchableOpacity
            style={localStyles.outlineLink}
            onPress={() => router.push('/(drawer)/banking/transfer' as never)}
            accessibilityRole="button"
            accessibilityLabel="Transfer between accounts"
          >
            <Text style={localStyles.linkText}>Transfer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={localStyles.outlineLink}
            onPress={() => router.push('/(drawer)/banking/cash?mode=deposit' as never)}
            accessibilityRole="button"
            accessibilityLabel="Deposit money"
          >
            <Text style={localStyles.linkText}>Deposit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={localStyles.outlineLink}
            onPress={() => router.push('/(drawer)/banking/cash?mode=withdraw' as never)}
            accessibilityRole="button"
            accessibilityLabel="Withdraw money"
          >
            <Text style={localStyles.linkText}>Withdraw</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { paddingHorizontal: spacing.md }]}>Accounts</Text>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search account name or type..."
      />

      {booting && accounts.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={filteredAccounts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load()
                  .catch((e) => alertRefreshFailed(e))
                  .finally(() => setRefreshing(false));
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          getItemLayout={listCardGetItemLayout}
          {...FLATLIST_PERF}
          ListEmptyComponent={
            search.trim() ? (
              <EmptyState
                title="No matches"
                message="Try a different search."
              />
            ) : (
              <EmptyState
                title="No accounts yet"
                message="Add a bank or cash account to track balances."
                actionLabel="Add Account"
                onAction={() => router.push('/(drawer)/banking/add-account' as never)}
              />
            )
          }
          renderItem={renderAccountItem}
        />
      )}
    </View>
  );
}

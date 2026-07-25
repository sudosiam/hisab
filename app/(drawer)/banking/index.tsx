import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ListItem } from '../../../src/components/ListItem';
import { MoneyText } from '../../../src/components/MoneyText';
import { ErrorState, SearchField, useScreenStyles } from '../../../src/components/ui';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { getAccounts, getTotalBalance } from '../../../src/services/banking';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { spacing, radius, typography } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account } from '../../../src/types';

export default function BankingScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        totalCard: {
          ...cardSurface(colors, isDark),
          margin: spacing.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          alignItems: 'center',
        },
        totalLabel: { ...typography.section, color: colors.textSecondary, textTransform: 'uppercase' },
        totalHint: {
          fontSize: 11,
          color: colors.textSecondary,
          marginTop: spacing.xs,
          textAlign: 'center',
          paddingHorizontal: spacing.sm,
        },
        totalValueWrap: { width: '100%', marginTop: spacing.sm, paddingHorizontal: spacing.sm },
        actions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
          marginBottom: spacing.sm,
        },
        actionBtn: {
          flexGrow: 1,
          flexBasis: '47%',
          minWidth: 140,
          backgroundColor: colors.primary,
          paddingVertical: 10,
          minHeight: 40,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionBtnAlt: { backgroundColor: colors.primaryContainer, borderWidth: 0 },
        actionBtnSuccess: { backgroundColor: colors.success },
        actionBtnDanger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger + '55' },
        actionText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
        actionTextAlt: { color: colors.onPrimaryContainer, fontWeight: '700', fontSize: 13 },
        actionTextSuccess: { color: isDark ? '#0B1F14' : '#FFFFFF', fontWeight: '700', fontSize: 13 },
        actionTextDanger: { color: colors.danger, fontWeight: '700', fontSize: 13 },
      }),
    [colors, isDark]
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

  if (error && accounts.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.totalCard}>
        <Text style={localStyles.totalLabel}>Total Balance</Text>
        <Text style={localStyles.totalHint}>Active accounts only; deactivated accounts are excluded</Text>
        <View style={localStyles.totalValueWrap}>
          <MoneyText
            amount={totalBalance}
            size="hero"
            color={colors.primary}
            style={{ width: '100%', textAlign: 'center' }}
          />
        </View>
      </View>

      <View style={localStyles.actions}>
        <TouchableOpacity
          style={localStyles.actionBtn}
          onPress={() => router.push('/(drawer)/banking/add-account' as never)}
          accessibilityRole="button"
          accessibilityLabel="Add account"
        >
          <Text style={localStyles.actionText}>+ Account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[localStyles.actionBtn, localStyles.actionBtnAlt]}
          onPress={() => router.push('/(drawer)/banking/transfer' as never)}
          accessibilityRole="button"
          accessibilityLabel="Transfer between accounts"
        >
          <Text style={localStyles.actionTextAlt}>Transfer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[localStyles.actionBtn, localStyles.actionBtnSuccess]}
          onPress={() => router.push('/(drawer)/banking/cash?mode=deposit' as never)}
          accessibilityRole="button"
          accessibilityLabel="Deposit money"
        >
          <Text style={localStyles.actionTextSuccess}>Deposit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[localStyles.actionBtn, localStyles.actionBtnDanger]}
          onPress={() => router.push('/(drawer)/banking/cash?mode=withdraw' as never)}
          accessibilityRole="button"
          accessibilityLabel="Withdraw money"
        >
          <Text style={localStyles.actionTextDanger}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { paddingHorizontal: spacing.md }]}>Accounts</Text>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search account name or type..."
      />

      {booting && accounts.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
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
                load().finally(() => setRefreshing(false));
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          {...FLATLIST_PERF}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() ? 'No accounts match your search.' : 'No accounts yet'}
            </Text>
          }
          renderItem={({ item }) => (
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
          )}
        />
      )}
    </View>
  );
}

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
import { useFocusEffect, useRouter } from 'expo-router';
import { ErrorState, SearchField, useScreenStyles } from '../../../src/components/ui';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { getAccounts, getTotalBalance } from '../../../src/services/banking';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
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
          padding: spacing.lg,
          alignItems: 'center',
        },
        totalLabel: { ...typography.section, color: colors.textMuted, textTransform: 'uppercase' },
        totalHint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
        totalValue: { ...typography.display, color: colors.primary, marginTop: spacing.sm },
        actions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
          marginBottom: spacing.md,
        },
        actionBtn: {
          width: '48%',
          backgroundColor: colors.primary,
          paddingVertical: 12,
          borderRadius: radius.md,
          alignItems: 'center',
        },
        actionBtnAlt: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        actionBtnSuccess: { backgroundColor: colors.success },
        actionBtnDanger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
        actionText: { color: colors.onPrimary, fontWeight: '700', fontSize: 14 },
        actionTextAlt: { color: colors.primary, fontWeight: '700', fontSize: 14 },
        actionTextDanger: { color: colors.danger, fontWeight: '700', fontSize: 14 },
        accountRow: {
          ...cardSurface(colors, isDark),
          flexDirection: 'row',
          alignItems: 'center',
          padding: spacing.md,
          marginHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        accountName: { fontSize: 16, fontWeight: '600', color: colors.text },
        accountType: { fontSize: 12, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
        excludedBadge: {
          alignSelf: 'flex-start',
          marginTop: 4,
          paddingHorizontal: 6,
          paddingVertical: 1,
          borderRadius: radius.full,
          backgroundColor: colors.chip,
          borderWidth: 1,
          borderColor: colors.border,
        },
        excludedText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
        accountBalance: { fontSize: 17, fontWeight: '700', color: colors.text },
        balanceMuted: { color: colors.textMuted },
      }),
    [colors, isDark]
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filteredAccounts = useMemo(
    () => accounts.filter((item) => matchesSearch(search, [item.name, item.type])),
    [accounts, search]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, total] = await Promise.all([getAccounts(), getTotalBalance()]);
      setAccounts(a);
      setTotalBalance(total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  // refreshKey re-runs the loader whenever the global data version changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load, refreshKey]));

  if (error && accounts.length === 0) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.totalCard}>
        <Text style={localStyles.totalLabel}>Total Balance</Text>
        <Text style={localStyles.totalHint}>Active accounts only</Text>
        <Text style={localStyles.totalValue}>{formatCurrency(totalBalance)}</Text>
      </View>

      <View style={localStyles.actions}>
        <TouchableOpacity
          style={localStyles.actionBtn}
          onPress={() => router.push('/(drawer)/banking/add-account' as never)}
        >
          <Text style={localStyles.actionText}>+ Account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[localStyles.actionBtn, localStyles.actionBtnAlt]}
          onPress={() => router.push('/(drawer)/banking/transfer' as never)}
        >
          <Text style={localStyles.actionTextAlt}>Transfer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[localStyles.actionBtn, localStyles.actionBtnSuccess]}
          onPress={() => router.push('/(drawer)/banking/cash?mode=deposit' as never)}
        >
          <Text style={localStyles.actionText}>Deposit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[localStyles.actionBtn, localStyles.actionBtnDanger]}
          onPress={() => router.push('/(drawer)/banking/cash?mode=withdraw' as never)}
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

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredAccounts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
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
            <TouchableOpacity
              style={localStyles.accountRow}
              onPress={() => router.push(`/(drawer)/banking/${item.id}` as never)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={localStyles.accountName}>{item.name}</Text>
                <Text style={localStyles.accountType}>{item.type}</Text>
                {item.is_excluded ? (
                  <View style={localStyles.excludedBadge}>
                    <Text style={localStyles.excludedText}>Excluded</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  localStyles.accountBalance,
                  item.is_excluded ? localStyles.balanceMuted : null,
                ]}
              >
                {formatCurrency(item.current_balance)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

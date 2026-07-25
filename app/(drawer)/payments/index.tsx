import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { ListItem } from '../../../src/components/ListItem';
import { MoneyTotalRow } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import {
  ErrorState,
  Fab,
  FilterChip,
  FilterRow,
  SearchField,
  useScreenStyles,
} from '../../../src/components/ui';
import {
  getPaymentVouchers,
  type PaymentVoucherListItem,
} from '../../../src/services/paymentVouchers';
import { formatDisplayDate, getPeriodTotalLabel } from '../../../src/utils/date';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { useTheme } from '../../../src/context/ThemeContext';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { spacing } from '../../../src/constants/theme';

type Filter = 'all' | 'receipt' | 'payment' | 'advance';

function allocationPill(kind: PaymentVoucherListItem['allocation_kind']): string | undefined {
  switch (kind) {
    case 'against_invoice':
      return 'Invoice';
    case 'advance':
      return 'Advance';
    case 'on_account':
      return 'On acct';
    case 'mixed':
      return 'Mixed';
    default:
      return undefined;
  }
}

export default function PaymentsListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [items, setItems] = useState<PaymentVoucherListItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        matchesSearch(search, [
          item.voucher_no,
          item.party_name,
          item.date,
          item.narration,
          item.voucher_type,
          item.allocation_kind,
          item.payment_mode,
          item.instrument_no,
        ])
      ),
    [items, search]
  );

  const periodTotal = useMemo(
    () => filtered.reduce((sum, item) => sum + item.amount, 0),
    [filtered]
  );

  const inTotal = useMemo(
    () => filtered.filter((i) => i.voucher_type === 'receipt').reduce((s, i) => s + i.amount, 0),
    [filtered]
  );
  const outTotal = useMemo(
    () => filtered.filter((i) => i.voucher_type === 'payment').reduce((s, i) => s + i.amount, 0),
    [filtered]
  );

  const load = useCallback(async () => {
    const voucherType =
      filter === 'receipt' || filter === 'payment' ? filter : 'all';
    setItems(
      await getPaymentVouchers({
        periodKey: monthKey,
        voucherType,
        advanceOnly: filter === 'advance',
      })
    );
  }, [filter, monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, filter, monthKey]);

  const renderItem = useCallback(
    ({ item }: { item: PaymentVoucherListItem }) => {
      const isIn = item.voucher_type === 'receipt';
      return (
        <ListItem
          title={item.voucher_no}
          subtitle={`${item.party_name} · ${formatDisplayDate(item.date)}`}
          amount={item.amount}
          pill={isIn ? 'In' : 'Out'}
          pillTone={isIn ? 'default' : 'warn'}
          badge={
            allocationPill(item.allocation_kind) ? (
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color:
                    item.allocation_kind === 'advance' ? colors.primary : colors.textSecondary,
                }}
              >
                {allocationPill(item.allocation_kind)}
              </Text>
            ) : null
          }
          onPress={() => router.push(`/(drawer)/payments/${item.id}` as never)}
          accessibilityLabel={`${isIn ? 'Receipt' : 'Payment'} ${item.voucher_no}`}
        />
      );
    },
    [colors.primary, colors.textSecondary, router]
  );

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        <MoneyTotalRow
          label={search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
          amount={periodTotal}
        />
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            marginTop: 2,
            fontVariant: ['tabular-nums'],
          }}
        >
          In {formatCurrency(inTotal)} · Out {formatCurrency(outTotal)}
        </Text>
      </View>

      <FilterRow>
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'receipt', label: 'In' },
            { key: 'payment', label: 'Out' },
            { key: 'advance', label: 'Advance' },
          ] as { key: Filter; label: string }[]
        ).map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </FilterRow>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search voucher, party, mode..."
      />

      {booting && items.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load()
                  .catch(() => {})
                  .finally(() => setRefreshing(false));
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          {...FLATLIST_PERF}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() || filter !== 'all'
                ? 'No payments match your filters.'
                : 'No receipts or payments in this period. Add one to record money in/out, including advances.'}
            </Text>
          }
        />
      )}

      <Fab label="+ New Payment" onPress={() => router.push('/(drawer)/payments/new' as never)} />
    </View>
  );
}

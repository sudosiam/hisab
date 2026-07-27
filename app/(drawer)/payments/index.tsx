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
import { ListSkeleton } from '../../../src/components/Skeleton';
import {
  EmptyState,
  ErrorState,
  Fab,
  FilterChip,
  FilterRow,
  SearchField,
  SummaryHero,
  useScreenStyles,
  useFabListPadding,
} from '../../../src/components/ui';
import {
  getOrphanInvoicePayments,
  getPaymentVouchers,
  type PaymentVoucherListItem,
} from '../../../src/services/paymentVouchers';
import { formatDisplayDate, getPeriodTotalLabel } from '../../../src/utils/date';
import { matchesSearch } from '../../../src/utils/search';
import { useTheme } from '../../../src/context/ThemeContext';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { spacing } from '../../../src/constants/theme';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';

type Filter = 'all' | 'receipt' | 'payment' | 'advance';

type HistoryRow =
  | (PaymentVoucherListItem & { kind: 'voucher'; ref_path?: undefined })
  | {
      kind: 'orphan';
      id: string;
      voucher_type: 'receipt' | 'payment';
      voucher_no: string;
      date: string;
      party_name: string;
      amount: number;
      allocation_kind: 'against_invoice';
      narration?: null;
      payment_mode?: null;
      instrument_no?: null;
      ref_path: string;
    };

function allocationPill(kind: HistoryRow['allocation_kind']): string | undefined {
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
  const fabListPadding = useFabListPadding();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [items, setItems] = useState<HistoryRow[]>([]);
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
          item.kind === 'voucher' ? item.narration : '',
          item.voucher_type,
          item.allocation_kind,
          item.kind === 'voucher' ? item.payment_mode : '',
          item.kind === 'voucher' ? item.instrument_no : '',
          item.kind === 'orphan' ? 'invoice payment' : 'voucher',
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
    const vouchers = await getPaymentVouchers({
      periodKey: monthKey,
      voucherType,
      advanceOnly: filter === 'advance',
    });
    const voucherRows: HistoryRow[] = vouchers.map((v) => ({ ...v, kind: 'voucher' as const }));

    // Include sale/purchase screen payments so In/Out history is complete.
    let orphanRows: HistoryRow[] = [];
    if (filter !== 'advance') {
      const orphans = await getOrphanInvoicePayments({
        periodKey: monthKey,
        direction: filter === 'all' ? 'all' : filter,
      });
      orphanRows = orphans.map((o) => ({ ...o, kind: 'orphan' as const }));
    }

    const merged = [...voucherRows, ...orphanRows].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(a.id) < String(b.id) ? 1 : -1;
    });
    setItems(merged);
  }, [filter, monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, filter, monthKey]);

  const renderItem = useCallback(
    ({ item }: { item: HistoryRow }) => {
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
                {item.kind === 'orphan' ? ' · Sale/Purchase' : ''}
              </Text>
            ) : null
          }
          onPress={() =>
            router.push(
              (item.kind === 'orphan'
                ? item.ref_path
                : `/(drawer)/payments/${item.id}`) as never
            )
          }
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
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} allowAllTime />
        <SummaryHero
          label={search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
          amount={periodTotal}
          secondary={[
            { label: 'In', amount: inTotal, color: colors.success },
            { label: 'Out', amount: outTotal, color: colors.danger },
          ]}
        />
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
          contentContainerStyle={[styles.list, { paddingBottom: fabListPadding }]}
          renderItem={renderItem}
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
            search.trim() || filter !== 'all' ? (
              <EmptyState
                title="No matches"
                message="Try a different filter or search."
              />
            ) : (
              <EmptyState
                title="No payments yet"
                message="No receipts or payments in this period."
                actionLabel="New Payment"
                onAction={() => router.push('/(drawer)/payments/new' as never)}
              />
            )
          }
        />
      )}

      <Fab label="+ New Payment" onPress={() => router.push('/(drawer)/payments/new' as never)} />
    </View>
  );
}

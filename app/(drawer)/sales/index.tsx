import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getSales } from '../../../src/services/sales';
import { StatusBadge } from '../../../src/components/StatusBadge';
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
import { formatDisplayDate, getPeriodTotalLabel } from '../../../src/utils/date';
import { matchesSearch } from '../../../src/utils/search';
import { useTheme } from '../../../src/context/ThemeContext';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { spacing } from '../../../src/constants/theme';
import type { Sale } from '../../../src/types';

type Filter = 'all' | 'paid' | 'unpaid' | 'bos';

export default function SalesListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [bosCount, setBosCount] = useState(0);

  const filteredSales = useMemo(
    () =>
      sales.filter((item) =>
        matchesSearch(search, [
          item.invoice_no,
          item.party_name,
          item.date,
          item.notes,
          item.status,
          item.invoice_type === 'bos' ? 'bos bill of supply' : 'invoice',
        ])
      ),
    [sales, search]
  );

  const periodTotal = useMemo(
    () => filteredSales.reduce((sum, item) => sum + item.total_amount, 0),
    [filteredSales]
  );

  const periodDue = useMemo(
    () =>
      filteredSales.reduce(
        (sum, item) => sum + Math.max(0, item.total_amount - item.paid_amount),
        0
      ),
    [filteredSales]
  );

  const load = useCallback(async () => {
    const paymentFilter = filter === 'bos' ? 'all' : filter;
    const invoiceType = filter === 'bos' ? 'bos' : 'all';
    const [list, allInPeriod] = await Promise.all([
      getSales(paymentFilter, { periodKey: monthKey, invoiceType }),
      getSales('all', { periodKey: monthKey, invoiceType: 'all' }),
    ]);
    setSales(list);
    setInvoiceCount(allInPeriod.filter((s) => s.invoice_type !== 'bos').length);
    setBosCount(allInPeriod.filter((s) => s.invoice_type === 'bos').length);
  }, [filter, monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, filter, monthKey]);

  const renderItem = useCallback(
    ({ item }: { item: Sale }) => {
      const isBos = item.invoice_type === 'bos';
      const due = Math.max(0, item.total_amount - item.paid_amount);
      return (
        <ListItem
          title={item.invoice_no}
          subtitle={`${item.party_name} · ${formatDisplayDate(item.date)}`}
          amount={item.total_amount}
          badge={<StatusBadge status={item.status} />}
          pill={isBos ? 'BOS' : undefined}
          pillTone={isBos ? 'warn' : 'default'}
          dueAmount={due}
          onPress={() => router.push(`/(drawer)/sales/${item.id}`)}
          accessibilityLabel={`Sale ${item.invoice_no}`}
        />
      );
    },
    [router]
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
        {periodDue > 0.01 ? (
          <MoneyTotalRow
            label="Outstanding in period"
            amount={periodDue}
            amountColor={colors.danger}
            labelStyle={{ fontWeight: '400', fontSize: 13, color: colors.textSecondary }}
          />
        ) : null}
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            marginTop: 2,
            marginBottom: 2,
            fontVariant: ['tabular-nums'],
          }}
        >
          Inv {invoiceCount} · BOS {bosCount}
        </Text>
      </View>

      <FilterRow>
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'paid', label: 'Paid' },
            { key: 'unpaid', label: 'Outstanding' },
            { key: 'bos', label: 'BOS' },
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
        placeholder="Search invoice, customer, date..."
      />

      {booting && sales.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={filteredSales}
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
                ? 'No sales match your filters.'
                : 'No sales in this period. Create your first sale.'}
            </Text>
          }
        />
      )}

      <Fab label="+ New Sale" onPress={() => router.push('/(drawer)/sales/new' as never)} />
    </View>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getSales } from '../../../src/services/sales';
import { StatusBadge } from '../../../src/components/StatusBadge';
import {
  ErrorState,
  FilterChip,
  FilterRow,
  SearchField,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { getPeriodTotalLabel } from '../../../src/utils/date';
import { matchesSearch } from '../../../src/utils/search';
import { formatDisplayDate } from '../../../src/utils/date';
import { useTheme } from '../../../src/context/ThemeContext';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { radius, spacing } from '../../../src/constants/theme';
import type { Sale } from '../../../src/types';

type Filter = 'all' | 'paid' | 'unpaid' | 'bos';

export default function SalesListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        typeBadge: {
          alignSelf: 'flex-start',
          marginTop: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radius.sm,
          backgroundColor: colors.primary + '18',
        },
        typeBadgeBos: { backgroundColor: colors.warning + '22' },
        typeBadgeText: {
          fontSize: 11,
          fontWeight: '700',
          color: colors.primary,
        },
        typeBadgeTextBos: { color: colors.warning },
      }),
    [colors]
  );
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
    setSales(await getSales(paymentFilter, { periodKey: monthKey, invoiceType }));
  }, [filter, monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, filter, monthKey]);

  const renderItem = useCallback(
    ({ item }: { item: Sale }) => {
      const isBos = item.invoice_type === 'bos';
      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/(drawer)/sales/${item.id}`)}
        >
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{item.invoice_no}</Text>
            <StatusBadge status={item.status} />
          </View>
          <View style={[localStyles.typeBadge, isBos && localStyles.typeBadgeBos]}>
            <Text style={[localStyles.typeBadgeText, isBos && localStyles.typeBadgeTextBos]}>
              {isBos ? 'BOS' : 'Invoice'}
            </Text>
          </View>
          <Text style={styles.cardSub}>{item.party_name}</Text>
          <View style={[styles.row, { marginTop: 4 }]}>
            <Text style={styles.cardSub}>{formatDisplayDate(item.date)}</Text>
            <Text style={styles.amount}>{formatCurrency(item.total_amount)}</Text>
          </View>
          {item.paid_amount < item.total_amount && (
            <Text style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>
              Due: {formatCurrency(item.total_amount - item.paid_amount)}
            </Text>
          )}
        </TouchableOpacity>
      );
    },
    [colors.danger, localStyles, router, styles]
  );

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.sm }}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        <View style={[styles.row, { marginBottom: spacing.sm }]}>
          <Text style={styles.cardTitle}>
            {search.trim() ? 'Filtered Total' : getPeriodTotalLabel(monthKey)}
          </Text>
          <Text style={styles.amount}>{formatCurrency(periodTotal)}</Text>
        </View>
        {periodDue > 0.01 && (
          <View style={[styles.row, { marginBottom: spacing.sm }]}>
            <Text style={styles.cardSub}>Outstanding in period</Text>
            <Text style={[styles.amount, { color: colors.danger, fontSize: 15 }]}>
              {formatCurrency(periodDue)}
            </Text>
          </View>
        )}
      </View>

      <FilterRow>
        {([
          { key: 'all', label: 'All' },
          { key: 'paid', label: 'Paid' },
          { key: 'unpaid', label: 'Outstanding' },
          { key: 'bos', label: 'BOS' },
        ] as { key: Filter; label: string }[]).map((f) => (
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
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
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

      <Link href="/(drawer)/sales/new" asChild>
        <TouchableOpacity style={styles.fab}>
          <Text style={styles.fabText}>+ New Sale</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

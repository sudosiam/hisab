import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { ListItem } from '../../../src/components/ListItem';
import { MoneyTotalRow } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import {
  EmptyState,
  ErrorState,
  Fab,
  FilterChip,
  FilterRow,
  SearchField,
  useScreenStyles,
  useFabListPadding,
} from '../../../src/components/ui';
import { listAdjustmentNotes } from '../../../src/services/adjustmentNotes';
import { formatDisplayDate, getPeriodTotalLabel } from '../../../src/utils/date';
import { matchesSearch } from '../../../src/utils/search';
import { useTheme } from '../../../src/context/ThemeContext';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { spacing } from '../../../src/constants/theme';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';
import type { AdjustmentNote, AdjustmentNoteKind } from '../../../src/types';

type Filter = 'all' | AdjustmentNoteKind;

function kindLabel(kind: AdjustmentNoteKind): string {
  return kind === 'credit' ? 'Credit' : 'Debit';
}

export default function NotesListScreen() {
  const router = useRouter();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const styles = useScreenStyles();
  const fabListPadding = useFabListPadding();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [notes, setNotes] = useState<AdjustmentNote[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () =>
      notes.filter((item) =>
        matchesSearch(search, [
          item.note_no,
          item.party_name,
          item.date,
          item.reason,
          item.notes,
          item.note_kind,
          item.direction,
        ])
      ),
    [notes, search]
  );

  const periodTotal = useMemo(
    () => filtered.reduce((sum, item) => sum + item.total_amount, 0),
    [filtered]
  );

  const creditCount = useMemo(
    () => notes.filter((n) => n.note_kind === 'credit').length,
    [notes]
  );
  const debitCount = useMemo(
    () => notes.filter((n) => n.note_kind === 'debit').length,
    [notes]
  );

  const load = useCallback(async () => {
    const list = await listAdjustmentNotes({
      periodKey: monthKey,
      kind: filter === 'all' ? undefined : filter,
    });
    setNotes(list);
  }, [filter, monthKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, filter, monthKey]);

  const renderItem = useCallback(
    ({ item }: { item: AdjustmentNote }) => (
      <ListItem
        title={item.note_no}
        subtitle={`${item.party_name} · ${formatDisplayDate(item.date)}`}
        amount={item.total_amount}
        pill={kindLabel(item.note_kind)}
        pillTone={item.note_kind === 'credit' ? 'warn' : 'default'}
        meta={item.direction === 'sale' ? 'Sales' : 'Purchase'}
        onPress={() => router.push(`/(drawer)/notes/${item.id}` as never)}
        accessibilityLabel={`${kindLabel(item.note_kind)} note ${item.note_no}`}
      />
    ),
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
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            marginTop: 2,
            marginBottom: 2,
            fontVariant: ['tabular-nums'],
          }}
        >
          Credit {creditCount} · Debit {debitCount}
        </Text>
      </View>

      <FilterRow>
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'credit', label: 'Credit' },
            { key: 'debit', label: 'Debit' },
          ] as const
        ).map(({ key, label }) => (
          <FilterChip
            key={key}
            label={label}
            active={filter === key}
            onPress={() => setFilter(key)}
          />
        ))}
      </FilterRow>

      <SearchField value={search} onChangeText={setSearch} placeholder="Search adjustments…" />

      {booting && notes.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: fabListPadding }}
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
          ListEmptyComponent={
            search.trim() || filter !== 'all' ? (
              <EmptyState
                title="No matches"
                message="Try a different filter or search."
              />
            ) : (
              <EmptyState
                title="No adjustments yet"
                message="Record stock or price adjustments for this period."
                actionLabel="New Adjustment"
                onAction={() => router.push('/(drawer)/notes/new' as never)}
              />
            )
          }
          getItemLayout={listCardGetItemLayout}
          {...FLATLIST_PERF}
        />
      )}

      <Fab label="+ New Adjustment" onPress={() => router.push('/(drawer)/notes/new' as never)} />
    </View>
  );
}

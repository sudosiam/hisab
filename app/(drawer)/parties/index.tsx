import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ListItem } from '../../../src/components/ListItem';
import { ListSkeleton } from '../../../src/components/Skeleton';
import {
  EmptyState,
  ErrorState,
  Fab,
  FilterChip,
  FilterRow,
  FormInput,
  PrimaryButton,
  SearchField,
  SegmentedControl,
  SummaryHero,
  useScreenStyles,
  useFabListPadding,
} from '../../../src/components/ui';
import {
  createParty,
  getPartiesWithSummary,
} from '../../../src/services/parties';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { matchesSearch } from '../../../src/utils/search';
import { spacing } from '../../../src/constants/theme';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../../src/constants/listPerf';
import { cardSurface } from '../../../src/constants/shadows';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';
import { configureExpandAnimation } from '../../../src/utils/layoutAnimation';
import type { PartyType, PartyWithSummary } from '../../../src/types';

type Filter = 'all' | PartyType;

export default function PartiesScreen() {
  const router = useRouter();
  const { refreshKey, refresh } = useDatabase();
  const { colors, isDark } = useTheme();
  const styles = useScreenStyles();
  const fabListPadding = useFabListPadding();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        form: {
          ...cardSurface(colors, isDark),
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
        },
      }),
    [colors, isDark]
  );

  const [parties, setParties] = useState<PartyWithSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PartyType>('customer');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setParties(await getPartiesWithSummary());
  }, []);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey]);
  const [refreshing, setRefreshing] = useState(false);

  const filteredParties = useMemo(() => {
    return parties.filter((party) => {
      if (filter !== 'all' && party.type !== filter) return false;
      return matchesSearch(search, [party.name, party.phone, party.notes, party.type]);
    });
  }, [parties, filter, search]);

  const { totalReceivable, totalPayable } = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    for (const party of parties) {
      if (party.type === 'customer') {
        receivable += party.balance_due;
      } else {
        payable += party.balance_due;
      }
    }
    return { totalReceivable: receivable, totalPayable: payable };
  }, [parties]);

  const resetForm = () => {
    configureExpandAnimation();
    setName('');
    setType('customer');
    setPhone('');
    setNotes('');
    setAddress('');
    setShowForm(false);
  };

  const openForm = () => {
    configureExpandAnimation();
    resetFormFields();
    setShowForm(true);
  };

  const resetFormFields = () => {
    setName('');
    setType('customer');
    setPhone('');
    setNotes('');
    setAddress('');
  };

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    setSaving(true);
    try {
      const id = await createParty({
        name: name.trim(),
        type,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        address: address.trim() || undefined,
      });
      if (!id) {
        Alert.alert('Error', 'Could not open the new party record');
        await load();
        return;
      }
      refresh();
      resetForm();
      router.replace(`/(drawer)/parties/${id}` as never);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const renderPartyItem = useCallback(
    ({ item }: { item: PartyWithSummary }) => {
      const dueLabel = item.type === 'customer' ? 'Receivable' : 'Payable';
      const metaParts = [`${item.invoice_count} invoices`];
      if (item.last_activity) metaParts.push(`Last ${item.last_activity}`);
      return (
        <ListItem
          title={item.name}
          subtitle={metaParts.join(' · ')}
          amount={item.balance_due}
          amountColor={item.balance_due > 0 ? colors.danger : colors.success}
          pill={item.type}
          pillTone={item.type === 'vendor' ? 'warn' : 'default'}
          meta={dueLabel}
          onPress={() => router.push(`/(drawer)/parties/${item.id}` as never)}
          accessibilityLabel={`Party ${item.name}`}
        />
      );
    },
    [colors.danger, colors.success, router]
  );

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <SummaryHero
          label="Party Balances"
          amount={totalReceivable - totalPayable}
          secondary={[
            { label: 'To Receive', amount: totalReceivable, color: colors.danger },
            { label: 'To Pay', amount: totalPayable, color: colors.warning },
          ]}
        />
      </View>

      <FilterRow>
        {(['all', 'customer', 'vendor'] as Filter[]).map((f) => (
          <FilterChip
            key={f}
            label={f === 'all' ? 'All' : f === 'customer' ? 'Customers' : 'Vendors'}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </FilterRow>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search name, phone, notes..."
      />

      {showForm ? (
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={80}>
          <View style={localStyles.form}>
          <Text style={styles.cardTitle}>New Party</Text>
          <SegmentedControl
            options={[
              { value: 'customer', label: 'Customer' },
              { value: 'vendor', label: 'Vendor' },
            ]}
            value={type}
            onChange={setType}
          />
          <FormInput label="Name" value={name} onChangeText={setName} placeholder="Company or person name" />
          <FormInput label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          
          <FormInput
            label="Address (optional)"
            value={address}
            onChangeText={setAddress}
            multiline
          />
          <FormInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
          <PrimaryButton title="Add Party" onPress={handleSave} loading={saving} />
          <TouchableOpacity style={{ marginTop: spacing.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' }} onPress={resetForm}>
            <Text style={styles.link}>Cancel</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      ) : null}

      {booting && parties.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={filteredParties}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: fabListPadding }]}
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
                title="No parties yet"
                message="Add customers and suppliers to track invoices and balances."
                actionLabel="Add Party"
                onAction={() => {
                  resetForm();
                  setShowForm(true);
                }}
              />
            )
          }
          renderItem={renderPartyItem}
        />
      )}

      {!showForm ? (
        <Fab
          label="+ Add Party"
          onPress={openForm}
        />
      ) : null}
    </View>
  );
}

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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ListItem } from '../../../src/components/ListItem';
import { MoneyText } from '../../../src/components/MoneyText';
import { ListSkeleton } from '../../../src/components/Skeleton';
import {
  ErrorState,
  Fab,
  FilterChip,
  FilterRow,
  FormInput,
  PrimaryButton,
  SearchField,
  useScreenStyles,
} from '../../../src/components/ui';
import {
  createParty,
  getPartiesWithSummary,
} from '../../../src/services/parties';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useGstEnabled } from '../../../src/context/GstContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { matchesSearch } from '../../../src/utils/search';
import { spacing, radius } from '../../../src/constants/theme';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { FLATLIST_PERF } from '../../../src/constants/listPerf';
import { cardSurface } from '../../../src/constants/shadows';
import { stateName } from '../../../src/services/gst';
import type { PartyType, PartyWithSummary } from '../../../src/types';

type Filter = 'all' | PartyType;

export default function PartiesScreen() {
  const gstEnabled = useGstEnabled();
  const router = useRouter();
  const { refreshKey, refresh } = useDatabase();
  const { colors, isDark } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        summary: {
          ...cardSurface(colors, isDark),
          flexDirection: 'row',
          marginHorizontal: spacing.md,
          marginTop: spacing.sm,
          marginBottom: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          gap: spacing.sm,
        },
        summaryItem: { flex: 1, minWidth: 0, alignItems: 'center' },
        summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        form: {
          ...cardSurface(colors, isDark),
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
        },
        typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        typeChip: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: radius.md,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        typeChipText: { fontWeight: '600', color: colors.text },
        typeChipTextActive: { color: colors.onPrimary },
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
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
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
    setName('');
    setType('customer');
    setPhone('');
    setNotes('');
    setGstin('');
    setStateCode('');
    setAddress('');
    setShowForm(false);
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
        gstin: gstin.trim() || undefined,
        state: stateCode.trim() || undefined,
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

  if (error) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={localStyles.summary}>
        <View style={localStyles.summaryItem}>
          <MoneyText
            amount={totalReceivable}
            size="lg"
            color={colors.success}
            style={{ width: '100%', textAlign: 'center' }}
          />
          <Text style={localStyles.summaryLabel}>To Receive</Text>
        </View>
        <View style={localStyles.summaryItem}>
          <MoneyText
            amount={totalPayable}
            size="lg"
            color={colors.danger}
            style={{ width: '100%', textAlign: 'center' }}
          />
          <Text style={localStyles.summaryLabel}>To Pay</Text>
        </View>
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={localStyles.form}>
          <Text style={styles.cardTitle}>New Party</Text>
          <View style={localStyles.typeRow}>
            {(['customer', 'vendor'] as PartyType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[localStyles.typeChip, type === t && localStyles.typeChipActive]}
                onPress={() => setType(t)}
              >
                <Text style={[localStyles.typeChipText, type === t && localStyles.typeChipTextActive]}>
                  {t === 'customer' ? 'Customer' : 'Vendor'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <FormInput label="Name" value={name} onChangeText={setName} placeholder="Company or person name" />
          <FormInput label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          {gstEnabled ? (
            <>
              <FormInput
                label="GSTIN (optional)"
                value={gstin}
                onChangeText={setGstin}
                placeholder="15-character GSTIN"
                autoCapitalize="characters"
              />
              <FormInput
                label="State code (optional)"
                value={stateCode}
                onChangeText={setStateCode}
                placeholder="e.g. 27"
                keyboardType="number-pad"
                helperText={
                  stateCode.trim()
                    ? stateName(stateCode.trim()) || 'Unknown state code'
                    : '2-digit GST state code for CGST/SGST vs IGST'
                }
              />
            </>
          ) : null}
          <FormInput
            label="Address (optional)"
            value={address}
            onChangeText={setAddress}
            multiline
          />
          <FormInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
          <PrimaryButton title="Add Party" onPress={handleSave} loading={saving} />
          <TouchableOpacity style={{ marginTop: spacing.sm, alignItems: 'center' }} onPress={resetForm}>
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
          contentContainerStyle={styles.list}
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
                ? 'No parties match your search.'
                : 'No parties yet. Tap + Add Party below.'}
            </Text>
          }
          renderItem={({ item }) => {
            const dueLabel = item.type === 'customer' ? 'Receivable' : 'Payable';
            const metaParts = [`${item.invoice_count} invoices`];
            if (item.last_activity) metaParts.push(`Last ${item.last_activity}`);
            return (
              <ListItem
                title={item.name}
                subtitle={metaParts.join(' · ')}
                amount={item.balance_due}
                amountColor={item.balance_due > 0.01 ? colors.danger : colors.success}
                pill={item.type}
                pillTone={item.type === 'vendor' ? 'warn' : 'default'}
                meta={dueLabel}
                onPress={() => router.push(`/(drawer)/parties/${item.id}` as never)}
                accessibilityLabel={`Party ${item.name}`}
              />
            );
          }}
        />
      )}

      {!showForm ? (
        <Fab
          label="+ Add Party"
          onPress={() => {
            resetForm();
            setShowForm(true);
          }}
        />
      ) : null}
    </View>
  );
}

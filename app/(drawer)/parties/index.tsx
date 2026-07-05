import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
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
  syncPartiesFromTransactions,
} from '../../../src/services/parties';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatCurrency } from '../../../src/utils/format';
import { matchesSearch } from '../../../src/utils/search';
import { spacing, radius } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { PartyType, PartyWithSummary } from '../../../src/types';

type Filter = 'all' | PartyType;

export default function PartiesScreen() {
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
          justifyContent: 'space-around',
          marginHorizontal: spacing.md,
          marginTop: spacing.sm,
          marginBottom: spacing.sm,
          padding: spacing.md,
        },
        summaryItem: { alignItems: 'center' },
        summaryValue: { fontSize: 18, fontWeight: '700', color: colors.primary },
        summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        partyRow: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        partyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        partyInfo: { flex: 1, marginRight: spacing.sm },
        balanceBlock: { alignItems: 'flex-end' },
        balanceLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' },
        balanceValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
        balanceDue: { color: colors.danger },
        balanceClear: { color: colors.success },
        badge: {
          alignSelf: 'flex-start',
          marginTop: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radius.full,
          backgroundColor: colors.navActive,
        },
        badgeVendor: { backgroundColor: colors.warning + '22' },
        badgeText: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' },
        badgeTextVendor: { color: colors.warning },
        metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
        metaText: { fontSize: 12, color: colors.textSecondary },
        form: {
          ...cardSurface(colors, isDark),
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
          padding: spacing.md,
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PartyType>('customer');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    await syncPartiesFromTransactions();
    setParties(await getPartiesWithSummary());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, refreshKey]));

  const filteredParties = useMemo(() => {
    return parties.filter((party) => {
      if (filter !== 'all' && party.type !== filter) return false;
      return matchesSearch(search, [party.name, party.phone, party.notes, party.type]);
    });
  }, [parties, filter, search]);

  const customerCount = parties.filter((p) => p.type === 'customer').length;
  const vendorCount = parties.filter((p) => p.type === 'vendor').length;
  const totalReceivable = parties
    .filter((p) => p.type === 'customer')
    .reduce((sum, p) => sum + p.balance_due, 0);
  const totalPayable = parties
    .filter((p) => p.type === 'vendor')
    .reduce((sum, p) => sum + p.balance_due, 0);

  const resetForm = () => {
    setName('');
    setType('customer');
    setPhone('');
    setNotes('');
    setShowForm(false);
  };

  const handleSave = async () => {
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

  return (
    <View style={styles.container}>
      <View style={localStyles.summary}>
        <View style={localStyles.summaryItem}>
          <Text style={localStyles.summaryValue}>{customerCount}</Text>
          <Text style={localStyles.summaryLabel}>Customers</Text>
        </View>
        <View style={localStyles.summaryItem}>
          <Text style={localStyles.summaryValue}>{vendorCount}</Text>
          <Text style={localStyles.summaryLabel}>Vendors</Text>
        </View>
        <View style={localStyles.summaryItem}>
          <Text style={[localStyles.summaryValue, { color: colors.success }]}>
            {formatCurrency(totalReceivable)}
          </Text>
          <Text style={localStyles.summaryLabel}>To Receive</Text>
        </View>
        <View style={localStyles.summaryItem}>
          <Text style={[localStyles.summaryValue, { color: colors.danger }]}>
            {formatCurrency(totalPayable)}
          </Text>
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
          <FormInput label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="numeric" />
          <FormInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
          <PrimaryButton title="Add Party" onPress={handleSave} loading={saving} />
          <TouchableOpacity style={{ marginTop: spacing.sm, alignItems: 'center' }} onPress={resetForm}>
            <Text style={styles.link}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredParties}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 96 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() || filter !== 'all'
                ? 'No parties match your search.'
                : 'No parties yet. Tap + Add Party below.'}
            </Text>
          }
          renderItem={({ item }) => {
            const dueLabel = item.type === 'customer' ? 'Receivable' : 'Payable';
            const hasDue = item.balance_due > 0.01;
            return (
              <TouchableOpacity
                style={localStyles.partyRow}
                onPress={() => router.push(`/(drawer)/parties/${item.id}` as never)}
                activeOpacity={0.75}
              >
                <View style={localStyles.partyHeader}>
                  <View style={localStyles.partyInfo}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <View style={[localStyles.badge, item.type === 'vendor' && localStyles.badgeVendor]}>
                      <Text
                        style={[
                          localStyles.badgeText,
                          item.type === 'vendor' && localStyles.badgeTextVendor,
                        ]}
                      >
                        {item.type}
                      </Text>
                    </View>
                    <View style={localStyles.metaRow}>
                      <Text style={localStyles.metaText}>{item.invoice_count} invoices</Text>
                      {item.last_activity ? (
                        <Text style={localStyles.metaText}>Last: {item.last_activity}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={localStyles.balanceBlock}>
                    <Text style={localStyles.balanceLabel}>{dueLabel}</Text>
                    <Text
                      style={[
                        localStyles.balanceValue,
                        hasDue ? localStyles.balanceDue : localStyles.balanceClear,
                      ]}
                    >
                      {formatCurrency(item.balance_due)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {!showForm ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Text style={styles.fabText}>+ Add Party</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

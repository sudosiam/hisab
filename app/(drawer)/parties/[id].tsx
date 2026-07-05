import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  FormInput,
  PrimaryButton,
  useScreenStyles,
} from '../../../src/components/ui';
import { StatusBadge } from '../../../src/components/StatusBadge';
import {
  deleteParty,
  getPartyHistory,
  getPartyStatement,
  getPartySummary,
  updateParty,
} from '../../../src/services/parties';
import { formatSqliteError } from '../../../src/db/database';
import { formatCurrency } from '../../../src/utils/format';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { spacing, radius, typography } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { PartyHistoryItem, PartyStatementLine, PartySummary, PartyType } from '../../../src/types';

type Tab = 'statement' | 'history';

export default function PartyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        profileCard: {
          ...cardSurface(colors, isDark),
          margin: spacing.md,
          padding: spacing.lg,
        },
        profileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        avatar: {
          width: 56,
          height: 56,
          borderRadius: radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary + '18',
        },
        avatarText: { fontSize: 22, fontWeight: '700', color: colors.primary },
        profileInfo: { flex: 1 },
        name: { ...typography.title, color: colors.text },
        badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
        badge: {
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radius.full,
          backgroundColor: colors.navActive,
        },
        badgeVendor: { backgroundColor: colors.warning + '22' },
        badgeText: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' },
        badgeTextVendor: { color: colors.warning },
        metaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.sm,
        },
        metaRowPressable: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.sm,
          paddingVertical: spacing.xs,
        },
        metaText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
        phoneLink: { fontSize: 13, color: colors.primary, flex: 1, fontWeight: '600' },
        editBtn: {
          marginTop: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          paddingVertical: 10,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        editBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
        financeCard: {
          ...cardSurface(colors, isDark),
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
          padding: spacing.lg,
        },
        balanceLabel: {
          ...typography.section,
          color: colors.textMuted,
          textTransform: 'uppercase',
          textAlign: 'center',
        },
        balanceValue: {
          ...typography.display,
          textAlign: 'center',
          marginTop: spacing.xs,
          marginBottom: spacing.md,
        },
        progressTrack: {
          height: 6,
          borderRadius: radius.full,
          backgroundColor: colors.borderLight,
          overflow: 'hidden',
          marginBottom: spacing.md,
        },
        progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.success },
        progressLabel: {
          fontSize: 11,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.sm,
        },
        statsGrid: {
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          paddingTop: spacing.md,
        },
        statItem: { flex: 1, alignItems: 'center' },
        statDivider: { width: 1, backgroundColor: colors.borderLight },
        statLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
        statValue: { fontSize: 14, fontWeight: '700', color: colors.text },
        statPaid: { color: colors.success },
        quickActions: {
          flexDirection: 'row',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        quickBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          paddingVertical: 12,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
        },
        quickBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
        tabRow: {
          flexDirection: 'row',
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
          padding: 4,
          borderRadius: radius.md,
          backgroundColor: colors.chip,
          borderWidth: 1,
          borderColor: colors.border,
        },
        tabBtn: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: radius.sm,
          alignItems: 'center',
        },
        tabBtnActive: { backgroundColor: colors.surface, ...cardSurface(colors, isDark) },
        tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
        tabTextActive: { color: colors.primary, fontWeight: '700' },
        sectionCard: {
          ...cardSurface(colors, isDark),
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
          overflow: 'hidden',
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
          backgroundColor: colors.navActive,
        },
        sectionTitle: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        },
        sectionCount: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        stmtRow: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        stmtRowLast: { borderBottomWidth: 0 },
        stmtTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        stmtDesc: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1, marginRight: spacing.sm },
        stmtDate: { fontSize: 12, color: colors.textSecondary },
        stmtAmounts: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
          gap: spacing.sm,
        },
        stmtChip: {
          flex: 1,
          paddingVertical: 6,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.sm,
          backgroundColor: colors.background,
        },
        stmtChipLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 2 },
        stmtChipValue: { fontSize: 13, fontWeight: '600', color: colors.text },
        stmtBalChip: { backgroundColor: colors.navActive },
        stmtBalValue: { fontSize: 13, fontWeight: '700', color: colors.primary },
        historyRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        historyRowLast: { borderBottomWidth: 0 },
        historyIcon: {
          width: 40,
          height: 40,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.navActive,
          marginRight: spacing.sm,
        },
        historyBody: { flex: 1 },
        historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        historyInvoice: { fontSize: 15, fontWeight: '700', color: colors.text },
        historyMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        historyAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
        historyAmt: { fontSize: 12, color: colors.textSecondary },
        historyDue: { fontSize: 12, color: colors.danger, fontWeight: '700' },
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
        footer: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
        emptyBox: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
        emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
      }),
    [colors, isDark]
  );

  const [summary, setSummary] = useState<PartySummary | null>(null);
  const [statement, setStatement] = useState<PartyStatementLine[]>([]);
  const [history, setHistory] = useState<PartyHistoryItem[]>([]);
  const [tab, setTab] = useState<Tab>('statement');
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PartyType>('customer');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawId = useMemo(() => (Array.isArray(id) ? id[0] : id) ?? '', [id]);

  const partyId = useMemo(() => {
    if (!rawId || rawId === 'index') return null;
    const parsed = Number.parseInt(rawId, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [rawId]);

  useEffect(() => {
    if (rawId === 'index') {
      router.replace('/parties' as never);
    }
  }, [rawId, router]);

  const load = useCallback(async () => {
    if (rawId === 'index') return;

    if (!partyId) {
      setError('Invalid party');
      setLoading(false);
      return;
    }

    try {
      const [s, st, h] = await Promise.all([
        getPartySummary(partyId),
        getPartyStatement(partyId),
        getPartyHistory(partyId),
      ]);
      setSummary(s);
      setStatement(st);
      setHistory(h);
      setError(s ? null : 'Party not found');
      if (s) {
        setName(s.party.name);
        setType(s.party.type);
        setPhone(s.party.phone ?? '');
        setNotes(s.party.notes ?? '');
      }
    } catch (e) {
      setError(formatSqliteError(e));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [partyId, rawId]);

  useFocusEffect(
    useCallback(() => {
      if (rawId === 'index') return;
      setLoading(true);
      setError(null);
      load();
    }, [load, rawId])
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: summary?.party.name ?? 'Party Details' });
  }, [navigation, summary?.party.name]);

  const handleSave = async () => {
    if (!summary || !name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    setSaving(true);
    try {
      await updateParty(summary.party.id, {
        name: name.trim(),
        type,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      refresh();
      setShowEdit(false);
      setLoading(true);
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!summary) return;
    Alert.alert('Delete Party', `Remove ${summary.party.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteParty(summary.party.id);
            refresh();
            router.back();
          } catch (e) {
            Alert.alert('Error', formatSqliteError(e));
          }
        },
      },
    ]);
  };

  const openRecord = (item: PartyHistoryItem) => {
    if (item.record_type === 'sale') {
      router.push(`/(drawer)/sales/${item.id}` as never);
    } else {
      router.push(`/(drawer)/purchases/${item.id}` as never);
    }
  };

  const openQuickAction = () => {
    if (!summary) return;
    const encoded = encodeURIComponent(summary.party.name);
    if (summary.party.type === 'customer') {
      router.push(`/(drawer)/sales/new?partyName=${encoded}` as never);
    } else {
      router.push(`/(drawer)/purchases/new?supplierName=${encoded}` as never);
    }
  };

  const handleCall = async (phone: string) => {
    const tel = phone.replace(/[^\d+]/g, '');
    if (!tel) {
      Alert.alert('Invalid number', 'This phone number cannot be dialed.');
      return;
    }
    const url = `tel:${tel}`;
    try {
      if (Platform.OS === 'android') {
        await Linking.openURL(url);
        return;
      }
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot call', 'Phone calls are not supported on this device.');
      }
    } catch {
      Alert.alert('Error', 'Could not open the phone app.');
    }
  };

  if (rawId === 'index') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Party not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { party } = summary;
  const isCustomer = party.type === 'customer';
  const balanceLabel = isCustomer ? 'Receivable Balance' : 'Payable Balance';
  const balanceColor = summary.balanceDue > 0.01 ? colors.danger : colors.success;
  const paidPct =
    summary.totalBilled > 0 ? Math.min(100, (summary.totalPaid / summary.totalBilled) * 100) : 0;
  const initial = party.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.profileCard}>
        <View style={localStyles.profileTop}>
          <View style={localStyles.avatar}>
            <Text style={localStyles.avatarText}>{initial}</Text>
          </View>
          <View style={localStyles.profileInfo}>
            <Text style={localStyles.name}>{party.name}</Text>
            <View style={localStyles.badgeRow}>
              <View style={[localStyles.badge, party.type === 'vendor' && localStyles.badgeVendor]}>
                <Text
                  style={[localStyles.badgeText, party.type === 'vendor' && localStyles.badgeTextVendor]}
                >
                  {isCustomer ? 'Customer' : 'Vendor'}
                </Text>
              </View>
              {summary.lastActivityDate ? (
                <Text style={styles.cardSub}>Last: {summary.lastActivityDate}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {party.phone ? (
          <TouchableOpacity
            style={localStyles.metaRowPressable}
            onPress={() => handleCall(party.phone!)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Call ${party.phone}`}
          >
            <Ionicons name="call-outline" size={16} color={colors.primary} />
            <Text style={localStyles.phoneLink}>{party.phone}</Text>
            <Ionicons name="open-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
        {party.notes ? (
          <View style={localStyles.metaRow}>
            <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
            <Text style={localStyles.metaText}>{party.notes}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={localStyles.editBtn} onPress={() => setShowEdit(!showEdit)}>
          <Ionicons name={showEdit ? 'close-outline' : 'create-outline'} size={16} color={colors.primary} />
          <Text style={localStyles.editBtnText}>{showEdit ? 'Cancel Edit' : 'Edit Party'}</Text>
        </TouchableOpacity>
      </View>

      {showEdit ? (
        <View style={localStyles.form}>
          <Text style={styles.cardTitle}>Edit Party</Text>
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
          <FormInput label="Name" value={name} onChangeText={setName} />
          <FormInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="numeric" />
          <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline />
          <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
        </View>
      ) : null}

      <View style={localStyles.financeCard}>
        <Text style={localStyles.balanceLabel}>{balanceLabel}</Text>
        <Text style={[localStyles.balanceValue, { color: balanceColor }]}>
          {formatCurrency(summary.balanceDue)}
        </Text>
        {summary.totalBilled > 0 ? (
          <>
            <View style={localStyles.progressTrack}>
              <View style={[localStyles.progressFill, { width: `${paidPct}%` }]} />
            </View>
            <Text style={localStyles.progressLabel}>
              {paidPct.toFixed(0)}% {isCustomer ? 'collected' : 'paid'} · {formatCurrency(summary.totalPaid)} of{' '}
              {formatCurrency(summary.totalBilled)}
            </Text>
          </>
        ) : null}
        <View style={localStyles.statsGrid}>
          <View style={localStyles.statItem}>
            <Text style={localStyles.statLabel}>Invoices</Text>
            <Text style={localStyles.statValue}>{summary.invoiceCount}</Text>
          </View>
          <View style={localStyles.statDivider} />
          <View style={localStyles.statItem}>
            <Text style={localStyles.statLabel}>Billed</Text>
            <Text style={localStyles.statValue}>{formatCurrency(summary.totalBilled)}</Text>
          </View>
          <View style={localStyles.statDivider} />
          <View style={localStyles.statItem}>
            <Text style={localStyles.statLabel}>Paid</Text>
            <Text style={[localStyles.statValue, localStyles.statPaid]}>
              {formatCurrency(summary.totalPaid)}
            </Text>
          </View>
        </View>
      </View>

      <View style={localStyles.quickActions}>
        <TouchableOpacity style={localStyles.quickBtn} onPress={openQuickAction}>
          <Ionicons name={isCustomer ? 'cart-outline' : 'bag-handle-outline'} size={16} color={colors.onPrimary} />
          <Text style={localStyles.quickBtnText}>{isCustomer ? 'New Sale' : 'New Purchase'}</Text>
        </TouchableOpacity>
      </View>

      <View style={localStyles.tabRow}>
        <TouchableOpacity
          style={[localStyles.tabBtn, tab === 'statement' && localStyles.tabBtnActive]}
          onPress={() => setTab('statement')}
        >
          <Text style={[localStyles.tabText, tab === 'statement' && localStyles.tabTextActive]}>Statement</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[localStyles.tabBtn, tab === 'history' && localStyles.tabBtnActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[localStyles.tabText, tab === 'history' && localStyles.tabTextActive]}>History</Text>
        </TouchableOpacity>
      </View>

      {tab === 'statement' ? (
        <View style={localStyles.sectionCard}>
          <View style={localStyles.sectionHeader}>
            <Text style={localStyles.sectionTitle}>Account Statement</Text>
            <Text style={localStyles.sectionCount}>{statement.length} entries</Text>
          </View>
          {statement.length === 0 ? (
            <View style={localStyles.emptyBox}>
              <Ionicons name="document-text-outline" size={32} color={colors.textMuted} />
              <Text style={localStyles.emptyText}>No transactions yet for this party.</Text>
            </View>
          ) : (
            statement.map((line, index) => (
              <View
                key={line.id}
                style={[localStyles.stmtRow, index === statement.length - 1 && localStyles.stmtRowLast]}
              >
                <View style={localStyles.stmtTop}>
                  <Text style={localStyles.stmtDesc}>{line.description}</Text>
                  <Text style={localStyles.stmtDate}>{line.date}</Text>
                </View>
                <View style={localStyles.stmtAmounts}>
                  <View style={localStyles.stmtChip}>
                    <Text style={localStyles.stmtChipLabel}>Debit</Text>
                    <Text style={localStyles.stmtChipValue}>
                      {line.debit > 0 ? formatCurrency(line.debit) : '—'}
                    </Text>
                  </View>
                  <View style={localStyles.stmtChip}>
                    <Text style={localStyles.stmtChipLabel}>Credit</Text>
                    <Text style={localStyles.stmtChipValue}>
                      {line.credit > 0 ? formatCurrency(line.credit) : '—'}
                    </Text>
                  </View>
                  <View style={[localStyles.stmtChip, localStyles.stmtBalChip]}>
                    <Text style={localStyles.stmtChipLabel}>Balance</Text>
                    <Text style={localStyles.stmtBalValue}>{formatCurrency(line.balance)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      ) : (
        <View style={localStyles.sectionCard}>
          <View style={localStyles.sectionHeader}>
            <Text style={localStyles.sectionTitle}>Invoice History</Text>
            <Text style={localStyles.sectionCount}>{history.length} records</Text>
          </View>
          {history.length === 0 ? (
            <View style={localStyles.emptyBox}>
              <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
              <Text style={localStyles.emptyText}>No invoices yet for this party.</Text>
            </View>
          ) : (
            history.map((item, index) => {
              const due = item.total_amount - item.paid_amount;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[localStyles.historyRow, index === history.length - 1 && localStyles.historyRowLast]}
                  onPress={() => openRecord(item)}
                  activeOpacity={0.75}
                >
                  <View style={localStyles.historyIcon}>
                    <Ionicons
                      name={item.record_type === 'sale' ? 'receipt-outline' : 'bag-outline'}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={localStyles.historyBody}>
                    <View style={localStyles.historyTop}>
                      <Text style={localStyles.historyInvoice}>{item.invoice_no}</Text>
                      <StatusBadge status={item.status} />
                    </View>
                    <Text style={localStyles.historyMeta}>{item.date}</Text>
                    <View style={localStyles.historyAmounts}>
                      <Text style={localStyles.historyAmt}>Total {formatCurrency(item.total_amount)}</Text>
                      <Text style={localStyles.historyAmt}>Paid {formatCurrency(item.paid_amount)}</Text>
                      {due > 0.01 ? (
                        <Text style={localStyles.historyDue}>Due {formatCurrency(due)}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      <View style={localStyles.footer}>
        <PrimaryButton title="Delete Party" onPress={handleDelete} variant="danger" />
      </View>
    </ScrollView>
  );
}

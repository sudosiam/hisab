import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import {
  getPurchaseById,
  getPurchaseItems,
  getPurchasePayments,
  addPurchasePayment,
  deletePurchase,
} from '../../../src/services/purchases';
import { formatSqliteError } from '../../../src/db/database';
import { getAccounts } from '../../../src/services/banking';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO } from '../../../src/utils/date';
import { radius, spacing } from '../../../src/constants/theme';
import type { Account, Purchase, PurchaseItem, PurchasePayment } from '../../../src/types';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        invoice: { fontSize: 20, fontWeight: '700', color: colors.text },
        party: { color: colors.textSecondary, marginTop: 4 },
        date: { fontSize: 13, color: colors.textSecondary },
        summary: {
          backgroundColor: colors.surface,
          padding: spacing.md,
          borderRadius: radius.md,
          marginVertical: spacing.md,
          gap: 4,
          borderWidth: 1,
          borderColor: colors.border,
        },
        due: { color: colors.danger, fontWeight: '600' },
        itemRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        paySection: { marginTop: spacing.md },
        chip: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          backgroundColor: colors.chip,
          borderRadius: radius.sm,
          marginRight: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
        },
        chipActive: { backgroundColor: colors.chipActive, borderColor: colors.chipActive },
        chipText: { color: colors.chipText, fontSize: 13 },
        chipTextActive: { color: colors.chipTextActive, fontWeight: '600' },
      }),
    [colors]
  );
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [payments, setPayments] = useState<PurchasePayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const purchaseId = useMemo(() => parseRouteId(id), [id]);

  const load = useCallback(async () => {
    if (!purchaseId) {
      setError('Invalid purchase');
      setLoading(false);
      return;
    }
    try {
      const [p, i, pay, a] = await Promise.all([
        getPurchaseById(purchaseId),
        getPurchaseItems(purchaseId),
        getPurchasePayments(purchaseId),
        getAccounts(),
      ]);
      setPurchase(p);
      setItems(i);
      setPayments(pay);
      setAccounts(a);
      if (a.length > 0) setSelectedAccount(a[0].id);
      setError(p ? null : 'Purchase not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setPurchase(null);
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const handleAddPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || !purchase) return;
    const due = purchase.total_amount - purchase.paid_amount;
    if (amount > due + 0.01) {
      Alert.alert('Error', `Amount exceeds due (${formatCurrency(due)})`);
      return;
    }
    setSaving(true);
    try {
      await addPurchasePayment(purchase.id, { account_id: selectedAccount, amount, date: todayISO() });
      setPayAmount('');
      refresh();
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!purchase) return;
    Alert.alert(
      'Delete Purchase',
      `Delete ${purchase.invoice_no}? Stock will be reduced and payments reversed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePurchase(purchase.id);
              refresh();
              router.back();
            } catch (e) {
              Alert.alert('Error', formatSqliteError(e));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !purchase) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Purchase not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const due = purchase.total_amount - purchase.paid_amount;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.header}>
        <Text style={localStyles.invoice}>{purchase.invoice_no}</Text>
        <StatusBadge status={purchase.status} />
      </View>
      <Text style={localStyles.party}>{purchase.supplier_name}</Text>
      <Text style={localStyles.date}>{purchase.date}</Text>

      <View style={localStyles.summary}>
        <Text style={styles.value}>Total: {formatCurrency(purchase.total_amount)}</Text>
        <Text style={styles.value}>Paid: {formatCurrency(purchase.paid_amount)}</Text>
        <Text style={[styles.value, due > 0 && localStyles.due]}>Due: {formatCurrency(due)}</Text>
      </View>

      <SectionHeader title="Items" />
      {items.map((item) => (
        <View key={item.id} style={localStyles.itemRow}>
          <Text style={styles.value}>{item.product_name} — {item.qty} × {formatCurrency(item.unit_cost)}</Text>
          <Text style={styles.amount}>{formatCurrency(item.total)}</Text>
        </View>
      ))}

      <SectionHeader title="Payments" />
      {payments.map((p) => (
        <View key={p.id} style={localStyles.itemRow}>
          <Text style={styles.value}>{p.account_name}</Text>
          <Text style={styles.amount}>{formatCurrency(p.amount)}</Text>
        </View>
      ))}

      {due > 0 && (
        <View style={localStyles.paySection}>
          <ScrollView horizontal>
            {accounts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[localStyles.chip, selectedAccount === a.id && localStyles.chipActive]}
                onPress={() => setSelectedAccount(a.id)}
              >
                <Text style={selectedAccount === a.id ? localStyles.chipTextActive : localStyles.chipText}>
                  {a.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FormInput label="Amount" value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="Amount" />
          <PrimaryButton title="Record Payment" onPress={handleAddPayment} loading={saving} />
        </View>
      )}

      <PrimaryButton title="Delete Purchase" onPress={handleDelete} variant="danger" />
    </ScrollView>
  );
}

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
  getSaleById,
  getSaleItems,
  getSalePayments,
  addSalePayment,
  deleteSale,
} from '../../../src/services/sales';
import { formatSqliteError } from '../../../src/db/database';
import { getAccounts } from '../../../src/services/banking';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO } from '../../../src/utils/date';
import { radius, spacing } from '../../../src/constants/theme';
import type { Account, Sale, SaleItem, SalePayment } from '../../../src/types';

export default function SaleDetailScreen() {
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
        party: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
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
        cost: { color: colors.textSecondary, marginTop: 4 },
        profit: { color: colors.success, fontWeight: '700', marginTop: 4, fontSize: 16 },
        itemRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        itemName: { fontWeight: '500', color: colors.text },
        itemMeta: { fontSize: 12, color: colors.textSecondary },
        itemProfit: { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: 2 },
        itemTotal: { fontWeight: '600', color: colors.text },
        muted: { color: colors.textSecondary, fontSize: 13 },
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
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saleId = useMemo(() => parseRouteId(id), [id]);

  const load = useCallback(async () => {
    if (!saleId) {
      setError('Invalid sale');
      setLoading(false);
      return;
    }
    try {
      const [s, i, p, a] = await Promise.all([
        getSaleById(saleId),
        getSaleItems(saleId),
        getSalePayments(saleId),
        getAccounts(),
      ]);
      setSale(s);
      setItems(i);
      setPayments(p);
      setAccounts(a);
      if (a.length > 0) setSelectedAccount(a[0].id);
      if (s) {
        const dueAmt = s.total_amount - s.paid_amount;
        if (dueAmt > 0) setPayAmount(dueAmt.toFixed(2));
      }
      setError(s ? null : 'Sale not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setSale(null);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleAddPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Enter a valid amount');
      return;
    }
    if (!sale) return;

    const due = sale.total_amount - sale.paid_amount;
    if (amount > due + 0.01) {
      Alert.alert('Error', `Amount exceeds due (${formatCurrency(due)})`);
      return;
    }

    setSaving(true);
    try {
      await addSalePayment(sale.id, {
        account_id: selectedAccount,
        amount,
        date: todayISO(),
      });
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
    if (!sale) return;
    Alert.alert('Delete Sale', `Delete ${sale.invoice_no}? Stock and payments will be reversed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSale(sale.id);
            refresh();
            router.back();
          } catch (e) {
            Alert.alert('Error', formatSqliteError(e));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !sale) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Sale not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.back()}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const due = sale.total_amount - sale.paid_amount;
  const totalCost = items.reduce((sum, item) => sum + item.unit_cost * item.qty, 0);
  const grossProfit = items.reduce(
    (sum, item) => sum + (item.unit_price - item.unit_cost) * item.qty,
    0
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.header}>
        <Text style={localStyles.invoice}>{sale.invoice_no}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity onPress={() => router.push(`/(drawer)/sales/edit?id=${sale.id}` as never)}>
            <Text style={styles.link}>Edit</Text>
          </TouchableOpacity>
          <StatusBadge status={sale.status} />
        </View>
      </View>
      <Text style={localStyles.party}>{sale.party_name}</Text>
      <Text style={localStyles.date}>{sale.date}</Text>

      <View style={localStyles.summary}>
        {(sale.subtotal ?? sale.total_amount) > 0 && (sale.discount_amount ?? 0) > 0 ? (
          <>
            <Text style={styles.value}>Subtotal: {formatCurrency(sale.subtotal ?? sale.total_amount)}</Text>
            <Text style={styles.value}>Discount: {formatCurrency(sale.discount_amount ?? 0)}</Text>
          </>
        ) : null}
        <Text style={styles.value}>Total: {formatCurrency(sale.total_amount)}</Text>
        <Text style={styles.value}>Paid: {formatCurrency(sale.paid_amount)}</Text>
        <Text style={[styles.value, due > 0 && localStyles.due]}>
          Due: {formatCurrency(due)}
        </Text>
        <Text style={localStyles.cost}>Cost: {formatCurrency(totalCost)}</Text>
        <Text style={localStyles.profit}>Profit: {formatCurrency(grossProfit)}</Text>
      </View>

      <SectionHeader title="Items" />
      {items.map((item) => {
        const itemProfit = (item.unit_price - item.unit_cost) * item.qty;
        return (
          <View key={item.id} style={localStyles.itemRow}>
            <View>
              <Text style={localStyles.itemName}>{item.product_name}</Text>
              <Text style={localStyles.itemMeta}>
                {item.qty} × {formatCurrency(item.unit_price)} · Cost {formatCurrency(item.unit_cost)}
              </Text>
              <Text style={localStyles.itemProfit}>Profit: {formatCurrency(itemProfit)}</Text>
            </View>
            <Text style={localStyles.itemTotal}>{formatCurrency(item.total)}</Text>
          </View>
        );
      })}

      <SectionHeader title="Payments" />
      {payments.length === 0 ? (
        <Text style={localStyles.muted}>No payments recorded</Text>
      ) : (
        payments.map((p) => (
          <View key={p.id} style={localStyles.itemRow}>
            <Text style={styles.value}>{p.account_name}</Text>
            <Text style={styles.amount}>{formatCurrency(p.amount)}</Text>
          </View>
        ))
      )}

      {due > 0 && (
        <View style={localStyles.paySection}>
          <SectionHeader title="Add Payment" />
          <AccountPicker
            label="Payment Account"
            accounts={accounts}
            value={selectedAccount}
            onChange={setSelectedAccount}
          />
          <FormInput
            label="Amount"
            value={payAmount}
            onChangeText={setPayAmount}
            keyboardType="decimal-pad"
            placeholder="Amount"
          />
          <TouchableOpacity
            onPress={() => setPayAmount(due.toFixed(2))}
            style={{ marginBottom: spacing.sm }}
          >
            <Text style={styles.link}>Fill remaining ({formatCurrency(due)})</Text>
          </TouchableOpacity>
          <PrimaryButton title="Record Payment" onPress={handleAddPayment} loading={saving} />
        </View>
      )}

      {sale.notes ? (
        <>
          <SectionHeader title="Notes" />
          <Text style={localStyles.muted}>{sale.notes}</Text>
        </>
      ) : null}

      <PrimaryButton title="Delete Sale" onPress={handleDelete} variant="danger" />
    </ScrollView>
  );
}

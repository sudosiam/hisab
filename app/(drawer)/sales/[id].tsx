import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
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
import { getSelectableAccounts } from '../../../src/services/banking';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { StatCard } from '../../../src/components/StatCard';
import { AccountPicker } from '../../../src/components/AccountPicker';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { roundMoney } from '../../../src/utils/money';
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
        kpiRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginVertical: spacing.md,
        },
        discountNote: {
          fontSize: 12,
          color: colors.textMuted,
          marginBottom: spacing.xs,
        },
        itemRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        itemName: { fontWeight: '500', color: colors.text },
        itemMeta: { fontSize: 12, color: colors.textSecondary },
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
        getSelectableAccounts(),
      ]);
      setSale(s);
      setItems(i);
      setPayments(p);
      setAccounts(a);
      if (a.length > 0) setSelectedAccount(a[0].id);
      if (s) {
        const dueAmt = s.total_amount - s.paid_amount;
        if (dueAmt > 0) setPayAmount(formatAmountInput(dueAmt));
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
    if (!sale || saving) return;
    const amount = parsePositiveAmount(payAmount);
    if (amount === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!selectedAccount) {
      Alert.alert('Error', 'Select a payment account');
      return;
    }

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

  const due = roundMoney(sale.total_amount - sale.paid_amount);
  const totalCost = roundMoney(items.reduce((sum, item) => sum + item.unit_cost * item.qty, 0));
  const grossProfit = roundMoney(sale.total_amount - totalCost);
  const marginPct =
    sale.total_amount > 0 ? roundMoney((grossProfit / sale.total_amount) * 100) : 0;
  const hasDiscount = (sale.discount_amount ?? 0) > 0;
  const hasServiceCharges = (sale.service_charges ?? 0) > 0;

  return (
    <FormScreen>
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

      {hasDiscount || hasServiceCharges ? (
        <Text style={localStyles.discountNote}>
          Subtotal {formatCurrency(sale.subtotal)}
          {hasDiscount ? ` · Discount ${formatCurrency(sale.discount_amount)}` : ''}
          {hasServiceCharges ? ` · Service ${formatCurrency(sale.service_charges)}` : ''}
        </Text>
      ) : null}

      <View style={localStyles.kpiRow}>
        <StatCard label="Total" value={sale.total_amount} color={colors.primary} />
        <StatCard
          label="Due"
          value={due}
          color={due > 0 ? colors.danger : colors.success}
          subtitle={`Paid ${formatCurrency(sale.paid_amount)}`}
        />
        <StatCard
          label="Profit"
          value={grossProfit}
          color={grossProfit >= 0 ? colors.success : colors.danger}
          subtitle={`${marginPct}% margin · Cost ${formatCurrency(totalCost)}`}
        />
      </View>

      <SectionHeader title="Items" />
      {items.map((item) => (
        <View key={item.id} style={localStyles.itemRow}>
          <View style={{ flex: 1 }}>
            <Text style={localStyles.itemName}>{item.product_name}</Text>
            <Text style={localStyles.itemMeta}>
              {item.qty} × {formatCurrency(item.unit_price)}
            </Text>
          </View>
          <Text style={localStyles.itemTotal}>{formatCurrency(item.total)}</Text>
        </View>
      ))}

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
            onPress={() => setPayAmount(formatAmountInput(due))}
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

      <View style={{ marginTop: spacing.lg }}>
        <PrimaryButton title="Delete Sale" onPress={handleDelete} variant="danger" />
      </View>
    </FormScreen>
  );
}

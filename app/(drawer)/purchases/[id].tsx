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
  getPurchaseById,
  getPurchaseItems,
  getPurchasePayments,
  addPurchasePayment,
  deletePurchase,
} from '../../../src/services/purchases';
import { formatSqliteError } from '../../../src/db/database';
import { getPaymentAccounts } from '../../../src/services/banking';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { AttachmentSection } from '../../../src/components/AttachmentSection';
import { StatCard } from '../../../src/components/StatCard';
import { AccountPicker } from '../../../src/components/AccountPicker';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { roundMoney } from '../../../src/utils/money';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { spacing } from '../../../src/constants/theme';
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
        kpiRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginVertical: spacing.md,
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
      }),
    [colors]
  );
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [payments, setPayments] = useState<PurchasePayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
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
        getPaymentAccounts(),
      ]);
      setPurchase(p);
      setItems(i);
      setPayments(pay);
      setAccounts(a);
      if (a.length > 0) setSelectedAccount(a[0].id);
      if (p) {
        const dueAmt = p.total_amount - p.paid_amount;
        if (dueAmt > 0) setPayAmount(formatAmountInput(dueAmt));
      }
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
    if (!purchase || saving) return;
    const amount = parsePositiveAmount(payAmount);
    if (amount === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!selectedAccount) {
      Alert.alert('Error', 'Select a payment account');
      return;
    }
    if (!isValidISODate(payDate)) {
      Alert.alert('Error', 'Select a valid payment date');
      return;
    }
    const due = purchase.total_amount - purchase.paid_amount;
    if (amount > due + 0.01) {
      Alert.alert('Error', `Amount exceeds due (${formatCurrency(due)})`);
      return;
    }
    setSaving(true);
    try {
      await addPurchasePayment(purchase.id, { account_id: selectedAccount, amount, date: payDate });
      setPayAmount('');
      setPayDate(todayISO());
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

  const due = roundMoney(purchase.total_amount - purchase.paid_amount);
  const itemsCost = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const totalQty = roundMoney(items.reduce((sum, item) => sum + item.qty, 0));
  const hasDiscount = (purchase.discount_amount ?? 0) > 0;
  const subtotal = purchase.subtotal > 0 ? purchase.subtotal : itemsCost;

  return (
    <FormScreen>
      <View style={localStyles.header}>
        <Text style={localStyles.invoice}>{purchase.invoice_no}</Text>
        <StatusBadge status={purchase.status} />
      </View>
      <Text style={localStyles.party}>{purchase.supplier_name}</Text>
      <Text style={localStyles.date}>{purchase.date}</Text>
      {purchase.vendor_invoice_no ? (
        <Text style={localStyles.date}>Vendor invoice: {purchase.vendor_invoice_no}</Text>
      ) : null}

      {hasDiscount ? (
        <Text style={localStyles.date}>
          Subtotal {formatCurrency(subtotal)} · Discount {formatCurrency(purchase.discount_amount)}
        </Text>
      ) : null}

      <View style={localStyles.kpiRow}>
        <StatCard label="Total" value={purchase.total_amount} color={colors.primary} />
        <StatCard
          label="Due"
          value={due}
          color={due > 0 ? colors.danger : colors.success}
          subtitle={`Paid ${formatCurrency(purchase.paid_amount)}`}
        />
        <StatCard
          label="Items"
          displayValue={String(items.length)}
          color={colors.accent}
          subtitle={`${totalQty} units · ${formatCurrency(itemsCost)} cost`}
        />
      </View>

      <SectionHeader title="Items" />
      {items.map((item) => (
        <View key={item.id} style={localStyles.itemRow}>
          <View style={{ flex: 1 }}>
            <Text style={localStyles.itemName}>{item.product_name}</Text>
            <Text style={localStyles.itemMeta}>
              {item.qty} × {formatCurrency(item.unit_cost)}
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
          <FormInput label="Amount" value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="Amount" />
          <DatePickerField label="Payment date" value={payDate} onChange={setPayDate} />
          <TouchableOpacity
            onPress={() => setPayAmount(formatAmountInput(due))}
            style={{ marginBottom: spacing.sm }}
          >
            <Text style={styles.link}>Fill remaining ({formatCurrency(due)})</Text>
          </TouchableOpacity>
          <PrimaryButton title="Record Payment" onPress={handleAddPayment} loading={saving} />
        </View>
      )}

      {purchase.notes ? (
        <>
          <SectionHeader title="Notes" />
          <Text style={localStyles.muted}>{purchase.notes}</Text>
        </>
      ) : null}

      <AttachmentSection referenceType="purchase" referenceId={purchase.id} />

      <PrimaryButton title="Delete Purchase" onPress={handleDelete} variant="danger" />
    </FormScreen>
  );
}

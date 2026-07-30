import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter, useNavigation } from 'expo-router';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import {
  getPurchaseById,
  getPurchaseItems,
  getPurchasePayments,
  addPurchasePayment,
  removePurchasePayment,
  deletePurchase,
  setPurchaseGstFlag,
} from '../../../src/services/purchases';
import { ThemedSwitch } from '../../../src/components/ThemedSwitch';
import {
  getVoucherLabelsForPurchasePayments,
  getVoucherLinkForPurchase,
} from '../../../src/services/paymentVouchers';
import { formatSqliteError } from '../../../src/db/database';
import { getPaymentAccounts } from '../../../src/services/banking';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { StatCard } from '../../../src/components/StatCard';
import { MoneyText } from '../../../src/components/MoneyText';
import { DetailSkeleton } from '../../../src/components/Skeleton';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { DetailHeaderActions } from '../../../src/components/DetailHeaderActions';
import {
  EmptyState,
  ErrorState,
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
  ThemedPressable,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { roundMoney } from '../../../src/utils/money';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO, isValidISODate, formatDisplayDate } from '../../../src/utils/date';
import { stackDetailBeforeRemove } from '../../../src/navigation/screenOptions';
import { cardSurface } from '../../../src/constants/shadows';
import { radius, spacing, typography } from '../../../src/constants/theme';
import type { Account, Purchase, PurchaseItem, PurchasePayment } from '../../../src/types';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { refresh } = useDatabaseActions();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      stackDetailBeforeRemove(navigation as never, e as never);
    });
    return unsub;
  }, [navigation]);
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        stack: {
          gap: spacing.md,
        },
        panel: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          gap: spacing.sm,
        },
        identityTop: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: spacing.sm,
        },
        invoice: {
          ...typography.title,
          fontSize: 18,
          fontWeight: '700',
          color: colors.text,
          flex: 1,
          minWidth: 0,
        },
        partyRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        },
        party: {
          ...typography.bodyMedium,
          color: colors.textSecondary,
          flex: 1,
          minWidth: 0,
        },
        gstRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        },
        gstLabel: {
          ...typography.bodyMedium,
          fontWeight: '600',
          color: colors.text,
          flex: 1,
          minWidth: 0,
        },
        gstHint: {
          ...typography.caption,
          color: colors.textMuted,
          marginTop: 2,
        },
        meta: {
          ...typography.caption,
          color: colors.textMuted,
        },
        matrix: {
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: isDark ? colors.surfaceContainer : colors.surfaceContainerHigh,
        },
        matrixRow: {
          flexDirection: 'row',
          alignItems: 'stretch',
        },
        vRule: {
          width: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          alignSelf: 'stretch',
        },
        hRule: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
        },
        listHeader: {
          marginBottom: spacing.xs,
        },
        listRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        listRowLast: {
          borderBottomWidth: 0,
          paddingBottom: 0,
        },
        listBody: {
          flex: 1,
          minWidth: 0,
          gap: 2,
        },
        itemName: {
          ...typography.bodyMedium,
          fontWeight: '500',
          color: colors.text,
        },
        itemMeta: {
          ...typography.caption,
          color: colors.textSecondary,
        },
        muted: {
          ...typography.caption,
          color: colors.textMuted,
        },
        payActions: {
          marginTop: spacing.sm,
          gap: spacing.sm,
        },
        payForm: {
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          gap: spacing.sm,
        },
        removeBtn: {
          paddingVertical: 4,
          paddingHorizontal: 2,
          minHeight: 44,
          justifyContent: 'center',
        },
      }),
    [colors, isDark]
  );
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [payments, setPayments] = useState<PurchasePayment[]>([]);
  const [paymentVoucherLabels, setPaymentVoucherLabels] = useState<Map<number, string>>(
    () => new Map()
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [selectedAccount, setSelectedAccount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingPaymentId, setRemovingPaymentId] = useState<number | null>(null);
  const [gstSaving, setGstSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const purchaseId = useMemo(() => parseRouteId(id), [id]);

  const hasLoadedRef = React.useRef(false);
  const loadGenRef = React.useRef(0);
  const payAmountRef = React.useRef(payAmount);
  payAmountRef.current = payAmount;
  const load = useCallback(async () => {
    if (!purchaseId) {
      setError('Invalid purchase');
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    try {
      const [p, i, pay, a, voucherLabels] = await Promise.all([
        getPurchaseById(purchaseId),
        getPurchaseItems(purchaseId),
        getPurchasePayments(purchaseId),
        getPaymentAccounts(),
        getVoucherLabelsForPurchasePayments(purchaseId),
      ]);
      if (gen !== loadGenRef.current) return;
      setPurchase(p);
      setItems(i);
      setPayments(pay);
      setPaymentVoucherLabels(voucherLabels);
      setAccounts(a);
      if (a.length > 0) setSelectedAccount(a[0].id);
      if (p && !hasLoadedRef.current) {
        // Prefill only on first load — refocusing (e.g. after switching apps)
        // must not wipe a partially typed payment amount.
        const dueAmt = p.total_amount - p.paid_amount;
        if (dueAmt > 0) setPayAmount(formatAmountInput(dueAmt));
      }
      setError(p ? null : 'Purchase not found');
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(formatSqliteError(e));
      setPurchase(null);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [purchaseId]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current && payAmountRef.current.trim() !== '') {
        return;
      }
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      load().finally(() => {
        hasLoadedRef.current = true;
      });
    }, [load])
  );

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
    if (amount > due + 1) {
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

  const handleGstToggle = async (value: boolean) => {
    if (!purchase || gstSaving) return;
    const previous = !!purchase.is_gst;
    setPurchase({ ...purchase, is_gst: value ? 1 : 0 });
    setGstSaving(true);
    try {
      await setPurchaseGstFlag(purchase.id, value);
      refresh();
    } catch (e) {
      setPurchase({ ...purchase, is_gst: previous ? 1 : 0 });
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setGstSaving(false);
    }
  };

  const handleRemovePayment = (payment: PurchasePayment) => {
    if (!purchase || removingPaymentId !== null) return;
    const voucherLabel = paymentVoucherLabels.get(payment.id);
    const base = `Remove ${formatCurrency(payment.amount)} from ${payment.account_name}? The invoice due will increase.`;
    const message = voucherLabel
      ? `${base}\n\nThis clears the link on voucher ${voucherLabel}.`
      : base;
    Alert.alert('Remove Payment', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemovingPaymentId(payment.id);
          try {
            await removePurchasePayment(purchase.id, payment.id);
            refresh();
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not remove payment');
          } finally {
            setRemovingPaymentId(null);
          }
        },
      },
    ]);
  };

  const handleDelete = useCallback(() => {
    if (!purchase) return;
    void (async () => {
      try {
        const link = await getVoucherLinkForPurchase(purchase.id);
        if (link) {
          Alert.alert(
            'Cannot delete',
            `Linked to ${link.label}. Delete or unlink that voucher first.`
          );
          return;
        }
        Alert.alert(
          'Delete Purchase',
          `Delete ${purchase.invoice_no}? Stock will be restored and payments reversed.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deletePurchase(purchase.id);
                  refresh();
                  router.dismissTo('/(drawer)/purchases');
                } catch (e) {
                  Alert.alert('Error', formatSqliteError(e));
                }
              },
            },
          ]
        );
      } catch (e) {
        Alert.alert('Error', formatSqliteError(e));
      }
    })();
  }, [purchase, refresh, router]);

  const handlePreviewPdf = useCallback(async () => {
    if (!purchase) return;
    try {
      const { previewPurchaseInvoicePdf } = await import('../../../src/services/purchaseInvoicePdf');
      await previewPurchaseInvoicePdf(purchase.id);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [purchase]);

  const handleSharePdf = useCallback(async () => {
    if (!purchase) return;
    try {
      const { sharePurchaseInvoicePdf } = await import('../../../src/services/purchaseInvoicePdf');
      await sharePurchaseInvoicePdf(purchase.id);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [purchase]);

  const handleDownloadPdf = useCallback(async () => {
    if (!purchase) return;
    try {
      const { downloadPurchaseInvoicePdf } = await import('../../../src/services/purchaseInvoicePdf');
      const result = await downloadPurchaseInvoicePdf(purchase.id);
      if (!result.success) Alert.alert('Could not save', result.message);
      else if (result.message.startsWith('Saved')) Alert.alert('Saved', result.message);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [purchase]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: purchase
        ? () => (
            <DetailHeaderActions
              onShare={handleSharePdf}
              overflowActions={[
                { label: 'Preview / Print', onPress: handlePreviewPdf },
                { label: 'Download PDF', onPress: handleDownloadPdf },
                {
                  label: 'Issue credit note',
                  onPress: () =>
                    router.push(
                      `/(drawer)/notes/new?againstPurchaseId=${purchase.id}&kind=credit&direction=purchase` as never
                    ),
                },
                {
                  label: 'Issue debit note',
                  onPress: () =>
                    router.push(
                      `/(drawer)/notes/new?againstPurchaseId=${purchase.id}&kind=debit&direction=purchase` as never
                    ),
                },
                {
                  label: 'Delete Purchase',
                  destructive: true,
                  onPress: handleDelete,
                },
              ]}
            />
          )
        : undefined,
    });
  }, [navigation, purchase, router, handleDelete, handlePreviewPdf, handleDownloadPdf, handleSharePdf]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => { void load(); }} />;
  }

  if (!purchase) {
    return (
      <EmptyState
        title="Not found"
        message="This record is missing or was deleted."
        actionLabel="Go Back"
        onAction={() => router.dismissTo('/(drawer)/purchases')}
      />
    );
  }

  const due = roundMoney(purchase.total_amount - purchase.paid_amount);
  const itemsCost = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const totalQty = roundMoney(items.reduce((sum, item) => sum + item.qty, 0));
  const hasDiscount = (purchase.discount_amount ?? 0) > 0;
  const subtotal = purchase.subtotal > 0 ? purchase.subtotal : itemsCost;

  return (
    <FormScreen>
      <View style={localStyles.stack}>
        <View style={localStyles.panel}>
          <View style={localStyles.identityTop}>
            <Text style={localStyles.invoice} numberOfLines={1}>
              {purchase.invoice_no}
            </Text>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <StatusBadge status={purchase.status} />
              <Text
                style={[
                  localStyles.meta,
                  {
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    color: purchase.is_gst ? colors.primary : colors.textMuted,
                  },
                ]}
              >
                {purchase.is_gst ? 'GST' : 'Non-GST'}
              </Text>
            </View>
          </View>
          <View style={localStyles.partyRow}>
            <Text style={localStyles.party} numberOfLines={2}>
              {purchase.supplier_name}
            </Text>
            <ThemedPressable
              onPress={() => router.push(`/(drawer)/purchases/edit?id=${purchase.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel="Edit purchase"
            >
              <Text style={styles.link}>Edit</Text>
            </ThemedPressable>
          </View>
          <Text style={localStyles.meta}>{formatDisplayDate(purchase.date)}</Text>
          {purchase.vendor_invoice_no ? (
            <Text style={localStyles.meta}>Vendor invoice: {purchase.vendor_invoice_no}</Text>
          ) : null}
          {hasDiscount ? (
            <Text style={localStyles.meta}>
              Subtotal {formatCurrency(subtotal)} · Discount{' '}
              {formatCurrency(purchase.discount_amount)}
            </Text>
          ) : null}
        </View>

        <View style={localStyles.panel}>
          <View style={localStyles.gstRow}>
            <View style={{ flex: 1, minWidth: 0, marginRight: spacing.sm }}>
              <Text style={localStyles.gstLabel}>GST purchase</Text>
              <Text style={localStyles.gstHint}>Label only — does not change amounts</Text>
            </View>
            <ThemedSwitch
              value={!!purchase.is_gst}
              onValueChange={(v) => void handleGstToggle(v)}
              disabled={gstSaving}
              accessibilityLabel="GST purchase"
            />
          </View>
        </View>

        <View style={localStyles.matrix}>
          <View style={localStyles.matrixRow}>
            <StatCard
              equal
              variant="matrix"
              icon="receipt-outline"
              label="Total"
              value={purchase.total_amount}
              color={colors.primary}
            />
            <View style={localStyles.vRule} />
            <StatCard
              equal
              variant="matrix"
              icon="wallet-outline"
              label="Due"
              value={due}
              color={due > 0 ? colors.danger : colors.success}
              valueColor={due > 0 ? colors.danger : colors.success}
              subtitle={`Paid ${formatCurrency(purchase.paid_amount)}`}
            />
          </View>
          <View style={localStyles.hRule} />
          <StatCard
            equal
            variant="matrix"
            icon="cube-outline"
            label="Items"
            displayValue={String(items.length)}
            color={colors.accent}
            subtitle={`${totalQty} units · ${formatCurrency(itemsCost)} cost`}
          />
        </View>

        <View style={localStyles.panel}>
          <View style={localStyles.listHeader}>
            <SectionHeader title="Items" tight />
          </View>
          {items.map((item, index) => (
            <View
              key={item.id}
              style={[
                localStyles.listRow,
                index === items.length - 1 && localStyles.listRowLast,
              ]}
            >
              <View style={localStyles.listBody}>
                <Text style={localStyles.itemName} numberOfLines={2}>
                  {item.product_name}
                </Text>
                <Text style={localStyles.itemMeta}>
                  {item.qty} × {formatCurrency(item.unit_cost)}
                </Text>
              </View>
              <MoneyText amount={item.total} size="md" style={{ textAlign: 'right' }} />
            </View>
          ))}
        </View>

        <View style={localStyles.panel}>
          <View style={localStyles.listHeader}>
            <SectionHeader title="Payments" tight />
          </View>
          {payments.length === 0 ? (
            <Text style={localStyles.muted}>No payments recorded</Text>
          ) : (
            payments.map((p, index) => (
              <View
                key={p.id}
                style={[
                  localStyles.listRow,
                  index === payments.length - 1 && due <= 0 && localStyles.listRowLast,
                ]}
              >
                <View style={localStyles.listBody}>
                  <Text style={localStyles.itemName} numberOfLines={1}>
                    {p.account_name}
                  </Text>
                  <Text style={localStyles.itemMeta}>
                    {formatDisplayDate(p.date)}
                    {paymentVoucherLabels.get(p.id)
                      ? ` · ${paymentVoucherLabels.get(p.id)}`
                      : ''}
                  </Text>
                </View>
                <MoneyText amount={p.amount} size="md" style={{ textAlign: 'right' }} />
                <ThemedPressable
                  style={localStyles.removeBtn}
                  onPress={() => handleRemovePayment(p)}
                  disabled={removingPaymentId === p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove payment ${formatCurrency(p.amount)}`}
                >
                  <Text style={[styles.link, { color: colors.warning }]}>
                    {removingPaymentId === p.id ? '…' : 'Remove'}
                  </Text>
                </ThemedPressable>
              </View>
            ))
          )}

          {due > 0 ? (
            <View style={localStyles.payForm}>
              <SectionHeader title="Add payment" tight />
              <AccountPicker
                label="Payment Account"
                accounts={accounts}
                value={selectedAccount}
                onChange={setSelectedAccount}
              />
              <FormInput label="Amount" value={payAmount} onChangeText={setPayAmount} money />
              <DatePickerField label="Payment date" value={payDate} onChange={setPayDate} />
              <View style={localStyles.payActions}>
                <ThemedPressable
                  onPress={() => setPayAmount(formatAmountInput(due))}
                  accessibilityRole="button"
                  accessibilityLabel={`Fill remaining ${formatCurrency(due)}`}
                >
                  <Text style={styles.link}>Fill remaining ({formatCurrency(due)})</Text>
                </ThemedPressable>
                <PrimaryButton title="Record Payment" onPress={handleAddPayment} loading={saving} />
              </View>
            </View>
          ) : null}
        </View>

        {purchase.notes ? (
          <View style={localStyles.panel}>
            <View style={localStyles.listHeader}>
              <SectionHeader title="Notes" tight />
            </View>
            <Text style={localStyles.muted}>{purchase.notes}</Text>
          </View>
        ) : null}
      </View>
    </FormScreen>
  );
}

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter, useNavigation } from 'expo-router';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { getSaleById, getSaleItems, getSalePayments, addSalePayment, removeSalePayment, deleteSale } from '../../../src/services/sales';
import { calculateSaleCogs, calculateSaleGrossProfit } from '../../../src/services/financials';
import { formatSqliteError } from '../../../src/db/database';
import { getSelectableAccounts } from '../../../src/services/banking';
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
import type { Account, Sale, SaleItem, SalePayment } from '../../../src/types';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { refresh } = useDatabaseActions();

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      stackDetailBeforeRemove(navigation as never, e as never);
    });
    return unsub;
  }, [navigation]);
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
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
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [selectedAccount, setSelectedAccount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingPaymentId, setRemovingPaymentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saleId = useMemo(() => parseRouteId(id), [id]);

  const hasLoadedRef = React.useRef(false);
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
      if (s && !hasLoadedRef.current) {
        // Prefill only on first load — refocusing (e.g. after switching apps)
        // must not wipe a partially typed payment amount.
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
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      load().finally(() => {
        hasLoadedRef.current = true;
      });
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
    if (!isValidISODate(payDate)) {
      Alert.alert('Error', 'Select a valid payment date');
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
        date: payDate,
      });
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

  const handleRemovePayment = (payment: SalePayment) => {
    if (!sale || removingPaymentId !== null) return;
    Alert.alert(
      'Remove Payment',
      `Remove ${formatCurrency(payment.amount)} from ${payment.account_name}? The invoice due will increase.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingPaymentId(payment.id);
            try {
              await removeSalePayment(sale.id, payment.id);
              refresh();
              await load();
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not remove payment');
            } finally {
              setRemovingPaymentId(null);
            }
          },
        },
      ]
    );
  };

  const handleDelete = useCallback(() => {
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
            router.dismissTo('/(drawer)/sales');
          } catch (e) {
            Alert.alert('Error', formatSqliteError(e));
          }
        },
      },
    ]);
  }, [sale, refresh, router]);

  const handlePreviewPdf = useCallback(async () => {
    if (!sale) return;
    try {
      const { previewSaleInvoicePdf } = await import('../../../src/services/saleInvoicePdf');
      await previewSaleInvoicePdf(sale.id);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [sale]);

  const handleSharePdf = useCallback(async () => {
    if (!sale) return;
    try {
      const { shareSaleInvoicePdf } = await import('../../../src/services/saleInvoicePdf');
      await shareSaleInvoicePdf(sale.id);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [sale]);

  const handleDownloadPdf = useCallback(async () => {
    if (!sale) return;
    try {
      const { downloadSaleInvoicePdf } = await import('../../../src/services/saleInvoicePdf');
      const result = await downloadSaleInvoicePdf(sale.id);
      if (!result.success) Alert.alert('Could not save', result.message);
      else if (result.message.startsWith('Saved')) Alert.alert('Saved', result.message);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [sale]);

  const handleWhatsApp = useCallback(async () => {
    if (!sale) return;
    try {
      if (sale.party_id) {
        const { getPartyById } = await import('../../../src/services/parties');
        const { normalizeWhatsAppPhone } = await import('../../../src/utils/whatsappShare');
        const party = await getPartyById(sale.party_id);
        if (!normalizeWhatsAppPhone(party?.phone)) {
          const proceed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'No WhatsApp number',
              'Add this customer\'s phone on Parties to open their chat automatically. Share to WhatsApp anyway?',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Share', onPress: () => resolve(true) },
              ]
            );
          });
          if (!proceed) return;
        }
      }
      const { shareSaleInvoiceWhatsApp } = await import('../../../src/services/saleInvoicePdf');
      await shareSaleInvoiceWhatsApp(sale.id);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [sale]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: sale
        ? () => (
            <DetailHeaderActions
              onShare={handleSharePdf}
              overflowActions={[
                { label: 'Preview / Print', onPress: handlePreviewPdf },
                { label: 'Download PDF', onPress: handleDownloadPdf },
                { label: 'Share on WhatsApp', onPress: handleWhatsApp },
                {
                  label: 'Issue credit note',
                  onPress: () =>
                    router.push(
                      `/(drawer)/notes/new?againstSaleId=${sale.id}&kind=credit&direction=sale` as never
                    ),
                },
                {
                  label: 'Issue debit note',
                  onPress: () =>
                    router.push(
                      `/(drawer)/notes/new?againstSaleId=${sale.id}&kind=debit&direction=sale` as never
                    ),
                },
                {
                  label: 'Delete Sale',
                  destructive: true,
                  onPress: handleDelete,
                },
              ]}
            />
          )
        : undefined,
    });
  }, [
    navigation,
    sale,
    router,
    handleDelete,
    handlePreviewPdf,
    handleDownloadPdf,
    handleSharePdf,
    handleWhatsApp,
  ]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => { void load(); }} />;
  }

  if (!sale) {
    return (
      <EmptyState
        title="Not found"
        message="This record is missing or was deleted."
        actionLabel="Go Back"
        onAction={() => router.dismissTo('/(drawer)/sales')}
      />
    );
  }

  const due = roundMoney(sale.total_amount - sale.paid_amount);
  const totalCost = calculateSaleCogs(sale, items);
  const grossProfit = calculateSaleGrossProfit(sale, items);
  const marginPct =
    sale.total_amount > 0 ? roundMoney((grossProfit / sale.total_amount) * 100) : 0;
  const hasDiscount = (sale.discount_amount ?? 0) > 0;
  const hasServiceCharges = (sale.service_charges ?? 0) > 0;
  const isBos = sale.invoice_type === 'bos';

  return (
    <FormScreen>
      <View style={localStyles.stack}>
        <View style={localStyles.panel}>
          <View style={localStyles.identityTop}>
            <Text style={localStyles.invoice} numberOfLines={1}>
              {sale.invoice_no}
            </Text>
            <StatusBadge status={sale.status} />
          </View>
          <View style={localStyles.partyRow}>
            <Text style={localStyles.party} numberOfLines={2}>
              {sale.party_name}
            </Text>
            <ThemedPressable
              onPress={() => router.push(`/(drawer)/sales/edit?id=${sale.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel="Edit sale"
            >
              <Text style={styles.link}>Edit</Text>
            </ThemedPressable>
          </View>
          <Text style={localStyles.meta}>
            {formatDisplayDate(sale.date)} · {isBos ? 'Bill of Supply' : 'Invoice'}
          </Text>
          {hasDiscount || hasServiceCharges ? (
            <Text style={localStyles.meta}>
              Subtotal {formatCurrency(sale.subtotal)}
              {hasDiscount ? ` · Discount ${formatCurrency(sale.discount_amount)}` : ''}
              {hasServiceCharges ? ` · Service ${formatCurrency(sale.service_charges)}` : ''}
            </Text>
          ) : null}
        </View>

        <View style={localStyles.matrix}>
          <View style={localStyles.matrixRow}>
            <StatCard
              equal
              variant="matrix"
              icon="receipt-outline"
              label="Total"
              value={sale.total_amount}
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
              subtitle={`Paid ${formatCurrency(sale.paid_amount)}`}
            />
          </View>
          <View style={localStyles.hRule} />
          <StatCard
            equal
            variant="matrix"
            icon="trending-up-outline"
            label="Profit"
            value={grossProfit}
            color={grossProfit >= 0 ? colors.success : colors.danger}
            valueColor={grossProfit >= 0 ? colors.success : colors.danger}
            subtitle={`${marginPct}% margin · Cost ${formatCurrency(totalCost)}`}
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
                  {item.qty} × {formatCurrency(item.unit_price)} · Cost{' '}
                  {formatCurrency(item.unit_cost)}
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
                  <Text style={localStyles.itemMeta}>{formatDisplayDate(p.date)}</Text>
                </View>
                <MoneyText amount={p.amount} size="md" style={{ textAlign: 'right' }} />
                <ThemedPressable
                  style={localStyles.removeBtn}
                  onPress={() => handleRemovePayment(p)}
                  disabled={removingPaymentId === p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove payment ${formatCurrency(p.amount)}`}
                >
                  <Text style={[styles.link, { color: colors.danger }]}>
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

        {sale.notes ? (
          <View style={localStyles.panel}>
            <View style={localStyles.listHeader}>
              <SectionHeader title="Notes" tight />
            </View>
            <Text style={localStyles.muted}>{sale.notes}</Text>
          </View>
        ) : null}
      </View>
    </FormScreen>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  ErrorState,
  FormScreen,
  SectionHeader,
} from '../../../src/components/ui';
import { MoneyText } from '../../../src/components/MoneyText';
import { getPaymentVoucherById } from '../../../src/services/paymentVouchers';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { formatDisplayDate } from '../../../src/utils/date';
import { formatCurrency } from '../../../src/utils/format';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { PaymentVoucher, PaymentVoucherAllocation, PaymentVoucherLine } from '../../../src/types';

function billTypeLabel(type: string): string {
  switch (type) {
    case 'agst_ref':
      return 'Against invoice';
    case 'advance':
      return 'Advance';
    case 'new_ref':
      return 'New ref';
    default:
      return 'On account';
  }
}

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const local = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [voucher, setVoucher] = useState<PaymentVoucher | null>(null);
  const [lines, setLines] = useState<PaymentVoucherLine[]>([]);
  const [allocations, setAllocations] = useState<PaymentVoucherAllocation[]>([]);

  const voucherId = useMemo(() => {
    const raw = Array.isArray(id) ? id[0] : id;
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [id]);

  const load = useCallback(async () => {
    if (!voucherId) throw new Error('Invalid payment');
    const detail = await getPaymentVoucherById(voucherId);
    if (!detail) throw new Error('Payment not found');
    setVoucher(detail.voucher);
    setLines(detail.lines);
    setAllocations(detail.allocations);
  }, [voucherId]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey, voucherId]);

  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (booting && !voucher) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  }
  if (!voucher) return <ErrorState message="Payment not found" onRetry={retry} />;

  const isIn = voucher.voucher_type === 'receipt';

  return (
    <FormScreen>
      <View style={local.hero}>
        <Text style={local.kicker}>{isIn ? 'Money In · Receipt' : 'Money Out · Payment'}</Text>
        <Text style={local.title}>{voucher.voucher_no}</Text>
        <Text style={local.meta}>
          {voucher.party_name} · {formatDisplayDate(voucher.date)}
        </Text>
        <MoneyText amount={voucher.amount} style={local.amount} />
      </View>

      {(voucher.payment_mode || voucher.instrument_no || voucher.instrument_bank) && (
        <View style={local.card}>
          <SectionHeader title="Instrument" />
          {voucher.payment_mode ? (
            <Text style={local.row}>Mode: {voucher.payment_mode}</Text>
          ) : null}
          {voucher.instrument_no ? (
            <Text style={local.row}>Ref: {voucher.instrument_no}</Text>
          ) : null}
          {voucher.instrument_bank ? (
            <Text style={local.row}>Bank: {voucher.instrument_bank}</Text>
          ) : null}
        </View>
      )}

      {voucher.narration ? (
        <View style={local.card}>
          <SectionHeader title="Narration" />
          <Text style={local.row}>{voucher.narration}</Text>
        </View>
      ) : null}

      <View style={local.card}>
        <SectionHeader title="Allocation" />
        {allocations.length === 0 ? (
          <Text style={local.muted}>On account</Text>
        ) : (
          allocations.map((a) => (
            <View key={a.id} style={local.allocRow}>
              <View style={{ flex: 1 }}>
                <Text style={local.allocTitle}>{a.bill_name}</Text>
                <Text style={local.muted}>{billTypeLabel(a.bill_type)}</Text>
              </View>
              <Text style={local.allocAmt}>{formatCurrency(a.amount)}</Text>
            </View>
          ))
        )}
      </View>

      {lines.length > 0 ? (
        <View style={local.card}>
          <SectionHeader title="Ledgers" />
          {lines.map((line) => (
            <View key={line.id} style={local.allocRow}>
              <Text style={[local.allocTitle, { flex: 1 }]}>
                {line.ledger_name}
                {line.is_party ? ' (party)' : ''}
                {line.is_bank_cash ? ' (cash/bank)' : ''}
              </Text>
              <Text style={local.allocAmt}>{formatCurrency(line.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </FormScreen>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    hero: {
      ...cardSurface(colors, isDark),
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: 4,
    },
    kicker: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    meta: { fontSize: 13, color: colors.textSecondary },
    amount: { fontSize: 24, fontWeight: '700', color: colors.primary, marginTop: 6 },
    card: {
      ...cardSurface(colors, isDark),
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    row: { fontSize: 14, color: colors.text, marginBottom: 4 },
    muted: { fontSize: 12, color: colors.textMuted },
    allocRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      gap: spacing.sm,
    },
    allocTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    allocAmt: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
  });
}

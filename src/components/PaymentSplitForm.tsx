import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { NumericKeyboardAccessory, NUMERIC_KEYBOARD_ACCESSORY_ID } from './NumericKeyboardAccessory';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { AccountPicker } from './AccountPicker';
import { DatePickerField } from './DatePickerField';
import type { Account } from '../types';
import { todayISO } from '../utils/date';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../utils/format';

export interface PaymentRow {
  /** Stable render key; older drafts may not have one. */
  key?: string;
  account_id: number;
  amount: string;
  date: string;
  notes: string;
}

interface Props {
  accounts: Account[];
  payments: PaymentRow[];
  onChange: (payments: PaymentRow[]) => void;
  totalDue: number;
  /** Default payment date for new rows (usually the invoice date). */
  defaultDate?: string;
  mode?: 'receive' | 'pay';
}

let paymentRowCounter = 0;
function nextRowKey(): string {
  paymentRowCounter += 1;
  return `payment-${Date.now()}-${paymentRowCounter}`;
}

export function PaymentSplitForm({
  accounts,
  payments,
  onChange,
  totalDue,
  defaultDate,
  mode = 'receive',
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const paidTotal = payments.reduce((sum, p) => sum + (parseAmountInput(p.amount) || 0), 0);
  const remaining = totalDue - paidTotal;
  const overpaid = remaining < -0.009;
  const labels =
    mode === 'pay'
      ? {
          title: 'Paid Amount',
          summary: 'Paid',
          overpaid: 'Overpaid by',
          account: 'Payment Account',
          empty: 'Add payment (leave empty for unpaid/credit)',
        }
      : {
          title: 'Received Payment',
          summary: 'Received',
          overpaid: 'Overpaid by',
          account: 'Receiving Account',
          empty: 'Add payment (leave empty for unpaid/credit)',
        };

  const prevDefaultDateRef = useRef(defaultDate);
  useEffect(() => {
    if (!defaultDate) return;
    const prev = prevDefaultDateRef.current;
    if (prev && prev !== defaultDate && payments.some((p) => p.date === prev)) {
      onChange(payments.map((p) => (p.date === prev ? { ...p, date: defaultDate } : p)));
    }
    prevDefaultDateRef.current = defaultDate;
  }, [defaultDate, onChange, payments]);

  const addPayment = (prefill?: number) => {
    if (accounts.length === 0) return;
    onChange([
      ...payments,
      {
        key: nextRowKey(),
        account_id: accounts[0].id,
        amount: prefill && prefill > 0 ? formatAmountInput(prefill) : '',
        date: defaultDate || todayISO(),
        notes: '',
      },
    ]);
  };

  const updatePayment = (index: number, field: keyof PaymentRow, value: string | number) => {
    const updated = [...payments];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removePayment = (index: number) => {
    onChange(payments.filter((_, i) => i !== index));
  };

  if (accounts.length === 0) {
    return <Text style={styles.hint}>Add a bank/cash account in Banking first.</Text>;
  }

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>{labels.title}</Text>
        <TouchableOpacity
          onPress={() => addPayment(remaining > 0 ? remaining : undefined)}
          accessibilityLabel="Add payment"
        >
          <Text style={styles.addBtn}>+ Add</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.summary, overpaid && styles.summaryOver]}>
        {overpaid
          ? `${labels.summary}: ${formatCurrency(paidTotal)} · ${labels.overpaid} ${formatCurrency(Math.abs(remaining))}`
          : `${labels.summary}: ${formatCurrency(paidTotal)} · Balance: ${formatCurrency(Math.max(0, remaining))}`}
      </Text>

      {payments.length === 0 ? (
        <TouchableOpacity style={styles.emptyBtn} onPress={() => addPayment()}>
          <Text style={styles.emptyBtnText}>{labels.empty}</Text>
        </TouchableOpacity>
      ) : (
        payments.map((payment, index) => (
          <View key={payment.key ?? `row-${index}`} style={styles.row}>
            <AccountPicker
              label={labels.account}
              accounts={accounts}
              value={payment.account_id}
              onChange={(id) => updatePayment(index, 'account_id', id)}
            />
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                inputAccessoryViewID={
                  Platform.OS === 'ios' ? NUMERIC_KEYBOARD_ACCESSORY_ID : undefined
                }
                value={payment.amount}
                onChangeText={(v) => updatePayment(index, 'amount', v)}
                accessibilityLabel="Payment amount"
              />
              <TouchableOpacity
                style={styles.fillBtn}
                accessibilityLabel="Fill remaining amount"
                onPress={() => {
                  const otherPaid = payments.reduce(
                    (sum, p, i) => (i === index ? sum : sum + (parseAmountInput(p.amount) || 0)),
                    0
                  );
                  const due = Math.max(0, totalDue - otherPaid);
                  updatePayment(index, 'amount', formatAmountInput(due));
                }}
              >
                <Text style={styles.fillText}>Full</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removePayment(index)}
                hitSlop={10}
                accessibilityLabel="Remove payment"
                accessibilityRole="button"
              >
                <Text style={styles.remove}>✕</Text>
              </TouchableOpacity>
            </View>
            <DatePickerField
              label="Date"
              value={payment.date}
              onChange={(iso) => updatePayment(index, 'date', iso)}
              compact
            />
          </View>
        ))
      )}
      <NumericKeyboardAccessory />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    title: { fontSize: 14, fontWeight: '700', color: colors.text },
    addBtn: { color: colors.accent, fontWeight: '700', fontSize: 13 },
    summary: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
    summaryOver: { color: colors.danger, fontWeight: '600' },
    row: {
      ...cardSurface(colors, isDark),
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    input: {
      borderWidth: 0,
      borderRadius: radius.md,
      padding: spacing.sm,
      minHeight: 44,
      fontVariant: ['tabular-nums'],
      backgroundColor: colors.inputBg,
      color: colors.text,
      fontSize: 14,
    },
    fillBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      minHeight: 40,
      justifyContent: 'center',
    },
    fillText: { color: colors.onPrimaryContainer, fontWeight: '700', fontSize: 12 },
    remove: { color: colors.danger, fontSize: 18, padding: spacing.sm },
    emptyBtn: {
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderStyle: 'dashed',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      minHeight: 48,
      justifyContent: 'center',
    },
    emptyBtnText: { color: colors.textSecondary, fontWeight: '500', textAlign: 'center', fontSize: 13 },
    hint: { color: colors.warning, fontSize: 12 },
  });
}

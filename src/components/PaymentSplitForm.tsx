import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from './NumericKeyboardAccessory';
import { ICON, SegmentedControl, ThemedPressable } from './ui';
import { ThemedSwitch } from './ThemedSwitch';
import { MoneyText } from './MoneyText';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { AccountPicker } from './AccountPicker';
import { DatePickerField } from './DatePickerField';
import type { Account } from '../types';
import { todayISO } from '../utils/date';
import { formatAmountInput, formatCurrency, parseAmountInput } from '../utils/format';
import { configureExpandAnimation } from '../utils/layoutAnimation';
import { roundMoney } from '../utils/money';

export interface PaymentRow {
  /** Stable render key; older drafts may not have one. */
  key?: string;
  account_id: number;
  amount: string;
  date: string;
  notes: string;
}

type PaymentUiMode = 'unpaid' | 'full' | 'split';

interface Props {
  accounts: Account[];
  payments: PaymentRow[];
  onChange: (payments: PaymentRow[]) => void;
  totalDue: number;
  /** Default payment date for new rows (usually the invoice date). */
  defaultDate?: string;
  mode?: 'receive' | 'pay';
  /** Optional party advance (sales). */
  advanceCredit?: number;
  applyAdvance?: boolean;
  onApplyAdvanceChange?: (value: boolean) => void;
  advanceApplied?: number;
}

let paymentRowCounter = 0;
function nextRowKey(): string {
  paymentRowCounter += 1;
  return `payment-${Date.now()}-${paymentRowCounter}`;
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01;
}

function deriveUiMode(payments: PaymentRow[], totalDue: number): PaymentUiMode {
  if (payments.length === 0) return 'unpaid';
  if (payments.length === 1) {
    const amt = parseAmountInput(payments[0].amount) || 0;
    if (totalDue <= 0.009 || amountsMatch(amt, totalDue)) return 'full';
  }
  return 'split';
}

export function PaymentSplitForm({
  accounts,
  payments,
  onChange,
  totalDue,
  defaultDate,
  mode = 'receive',
  advanceCredit = 0,
  applyAdvance = false,
  onApplyAdvanceChange,
  advanceApplied = 0,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [uiMode, setUiMode] = useState<PaymentUiMode>(() => deriveUiMode(payments, totalDue));
  /** True after the user picks a mode — blocks draft-hydrate from overriding Split/Full. */
  const userPickedModeRef = useRef(payments.length > 0);

  const cashPaid = payments.reduce((sum, p) => sum + (parseAmountInput(p.amount) || 0), 0);
  const receivedTotal = roundMoney(cashPaid + Math.max(0, advanceApplied));
  const balance = roundMoney(totalDue - cashPaid);
  const overpaid = balance < -0.009;
  const showAdvance = advanceCredit > 0.009 && typeof onApplyAdvanceChange === 'function';

  const labels =
    mode === 'pay'
      ? {
          section: 'Payment',
          summary: 'Paid',
          balance: 'Balance',
          overpaid: 'Overpaid',
          account: 'Payment account',
          unpaidHint: 'Save as unpaid — amount stays due to the vendor.',
          add: 'Add another payment',
        }
      : {
          section: 'Payment',
          summary: 'Received',
          balance: 'Balance',
          overpaid: 'Overpaid',
          account: 'Receiving account',
          unpaidHint: 'Save as unpaid — customer owes the balance.',
          add: 'Add another payment',
        };

  // Hydrate mode when payments appear from a draft (mount starts empty → async restore).
  // Do not re-derive after the user explicitly picks Split/Full.
  useEffect(() => {
    if (payments.length === 0) {
      userPickedModeRef.current = false;
      setUiMode((m) => (m === 'unpaid' ? m : 'unpaid'));
      return;
    }
    if (!userPickedModeRef.current) {
      setUiMode(deriveUiMode(payments, totalDue));
    }
  }, [payments, totalDue]);

  const prevDefaultDateRef = useRef(defaultDate);
  useEffect(() => {
    if (!defaultDate) return;
    const prev = prevDefaultDateRef.current;
    if (prev && prev !== defaultDate && payments.some((p) => p.date === prev)) {
      onChange(payments.map((p) => (p.date === prev ? { ...p, date: defaultDate } : p)));
    }
    prevDefaultDateRef.current = defaultDate;
  }, [defaultDate, onChange, payments]);

  // Keep Pay-full amount matched to due (advance / total edits).
  useEffect(() => {
    if (uiMode !== 'full' || payments.length !== 1 || accounts.length === 0) return;
    const due = Math.max(0, totalDue);
    const current = parseAmountInput(payments[0].amount) || 0;
    if (amountsMatch(current, due)) return;
    onChange([{ ...payments[0], amount: due > 0 ? formatAmountInput(due) : '' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync full-mode amount to due only
  }, [totalDue, uiMode]);

  const makeRow = (amount: number | '', accountId?: number): PaymentRow => ({
    key: nextRowKey(),
    account_id: accountId ?? accounts[0]?.id ?? 0,
    amount: typeof amount === 'number' && amount > 0 ? formatAmountInput(amount) : '',
    date: defaultDate || todayISO(),
    notes: '',
  });

  const selectMode = (next: PaymentUiMode) => {
    if (accounts.length === 0) return;
    configureExpandAnimation();
    userPickedModeRef.current = true;
    setUiMode(next);
    if (next === 'unpaid') {
      onChange([]);
      return;
    }
    if (next === 'full') {
      const accountId = payments[0]?.account_id || accounts[0].id;
      onChange([makeRow(Math.max(0, totalDue), accountId)]);
      return;
    }
    // Split: seed one row if empty; keep existing rows otherwise.
    if (payments.length === 0) {
      const seed = Math.max(0, totalDue);
      onChange([makeRow(seed > 0 ? seed : '')]);
    }
  };

  const addPayment = (prefill?: number) => {
    if (accounts.length === 0) return;
    configureExpandAnimation();
    userPickedModeRef.current = true;
    setUiMode('split');
    onChange([...payments, makeRow(prefill && prefill > 0 ? prefill : '')]);
  };

  const updatePayment = (index: number, field: keyof PaymentRow, value: string | number) => {
    const updated = [...payments];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removePayment = (index: number) => {
    configureExpandAnimation();
    const next = payments.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0) setUiMode('unpaid');
  };

  const fillRemaining = (index: number) => {
    const otherPaid = payments.reduce(
      (sum, p, i) => (i === index ? sum : sum + (parseAmountInput(p.amount) || 0)),
      0
    );
    const due = Math.max(0, totalDue - otherPaid);
    updatePayment(index, 'amount', formatAmountInput(due));
  };

  if (accounts.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{labels.section}</Text>
        <Text style={styles.hint}>Add a bank/cash account in Banking first.</Text>
      </View>
    );
  }

  const showRows = uiMode === 'full' || uiMode === 'split';
  const showAdd = uiMode === 'split';
  const showRemove = uiMode === 'split' && payments.length > 1;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{labels.section}</Text>

      <View style={styles.statusStrip}>
        <View style={styles.statusCol}>
          <Text style={styles.statusLabel}>{labels.summary}</Text>
          <MoneyText amount={receivedTotal} size="md" color={overpaid ? colors.danger : colors.text} />
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusCol}>
          <Text style={[styles.statusLabel, overpaid && styles.statusLabelDanger]}>
            {overpaid ? labels.overpaid : labels.balance}
          </Text>
          <MoneyText
            amount={Math.abs(balance)}
            size="md"
            color={overpaid ? colors.danger : colors.textSecondary}
          />
        </View>
      </View>

      <SegmentedControl
        options={[
          { value: 'unpaid', label: 'Unpaid' },
          { value: 'full', label: 'Pay full' },
          { value: 'split', label: 'Split' },
        ]}
        value={uiMode}
        onChange={selectMode}
      />

      {showAdvance ? (
        <View style={styles.advanceRow}>
          <View style={styles.advanceCopy}>
            <Text style={styles.advanceLabel}>Advance {formatCurrency(advanceCredit)}</Text>
            <Text style={styles.advanceMeta}>
              {applyAdvance
                ? `Will apply ${formatCurrency(advanceApplied)} to this invoice`
                : 'Apply available advance to this invoice'}
            </Text>
          </View>
          <ThemedSwitch
            value={applyAdvance}
            onValueChange={onApplyAdvanceChange}
            accessibilityLabel="Apply advance credit"
          />
        </View>
      ) : null}

      {uiMode === 'unpaid' ? <Text style={styles.unpaidHint}>{labels.unpaidHint}</Text> : null}

      {showRows
        ? payments.map((payment, index) => (
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
                  onChangeText={(v) => {
                    updatePayment(index, 'amount', v);
                    if (uiMode === 'full') {
                      userPickedModeRef.current = true;
                      setUiMode('split');
                    }
                  }}
                  accessibilityLabel="Payment amount"
                />
                {uiMode === 'split' ? (
                  <ThemedPressable
                    style={styles.fillBtn}
                    accessibilityLabel="Fill remaining amount"
                    onPress={() => fillRemaining(index)}
                  >
                    <Text style={styles.fillText}>Full</Text>
                  </ThemedPressable>
                ) : null}
                {showRemove ? (
                  <ThemedPressable
                    onPress={() => removePayment(index)}
                    hitSlop={10}
                    style={styles.removeBtn}
                    accessibilityLabel="Remove payment"
                    accessibilityRole="button"
                    haptic="warning"
                  >
                    <Ionicons name="close" size={ICON.inline} color={colors.danger} />
                  </ThemedPressable>
                ) : null}
              </View>
              <DatePickerField
                label="Date"
                value={payment.date}
                onChange={(iso) => updatePayment(index, 'date', iso)}
                compact
              />
            </View>
          ))
        : null}

      {showAdd ? (
        payments.length === 0 ? (
          <ThemedPressable
            style={styles.emptyBtn}
            onPress={() => addPayment(balance > 0 ? balance : undefined)}
            accessibilityLabel={labels.add}
          >
            <Text style={styles.emptyBtnText}>{labels.add}</Text>
          </ThemedPressable>
        ) : (
          <ThemedPressable
            style={styles.addLink}
            onPress={() => addPayment(balance > 0 ? balance : undefined)}
            accessibilityLabel={labels.add}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={ICON.inline} color={colors.primary} />
            <Text style={styles.addLinkText}>{labels.add}</Text>
          </ThemedPressable>
        )
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, isDark),
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.section,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    statusStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.border,
    },
    statusCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    statusDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: colors.border,
    },
    statusLabel: {
      ...typography.caption,
      color: colors.textMuted,
    },
    statusLabelDanger: {
      color: colors.danger,
      fontWeight: '600',
    },
    advanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderLight,
    },
    advanceCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    advanceLabel: {
      ...typography.bodyMedium,
      fontWeight: '600',
      color: colors.text,
    },
    advanceMeta: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    unpaidHint: {
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    row: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.md,
      padding: spacing.sm,
      gap: spacing.xs,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.border,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    input: {
      borderWidth: 0,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
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
      minHeight: 44,
      minWidth: 52,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
    },
    fillText: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
      fontSize: 12,
      textAlign: 'center',
    },
    removeBtn: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    emptyBtnText: {
      color: colors.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
      fontSize: 13,
    },
    addLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: 44,
      paddingVertical: spacing.xs,
    },
    addLinkText: {
      ...typography.bodyMedium,
      fontWeight: '600',
      color: colors.primary,
    },
    hint: {
      color: colors.warning,
      ...typography.caption,
    },
  });
}

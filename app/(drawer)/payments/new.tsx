import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
} from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { getSelectableAccounts } from '../../../src/services/banking';
import {
  createPaymentVoucher,
  getNextPaymentVoucherNo,
  getOpenInvoicesForParty,
} from '../../../src/services/paymentVouchers';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatCurrency, parseAmountInput } from '../../../src/utils/format';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { spacing, radius } from '../../../src/constants/theme';
import type { Account, PaymentBillType, PaymentVoucherType } from '../../../src/types';

type ApplyMode = 'against_invoice' | 'advance' | 'on_account';

export default function NewPaymentScreen() {
  const router = useRouter();
  const { refresh } = useDatabase();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [voucherType, setVoucherType] = useState<PaymentVoucherType>('receipt');
  const [voucherNo, setVoucherNo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [partyName, setPartyName] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [amount, setAmount] = useState('');
  const [applyMode, setApplyMode] = useState<ApplyMode>('against_invoice');
  const [openInvoices, setOpenInvoices] = useState<
    { id: number; invoice_no: string; date: string; due: number }[]
  >([]);
  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState<string | null>(null);
  const [narration, setNarration] = useState('');
  const [instrumentNo, setInstrumentNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [saving, setSaving] = useState(false);

  const reloadMeta = useCallback(async (type: PaymentVoucherType) => {
    const [accs, nextNo] = await Promise.all([
      getSelectableAccounts(),
      getNextPaymentVoucherNo(type),
    ]);
    setAccounts(accs);
    setAccountId((current) =>
      current && accs.some((a) => a.id === current) ? current : accs[0]?.id ?? 0
    );
    setVoucherNo(nextNo);
  }, []);

  useEffect(() => {
    void reloadMeta(voucherType).catch((e) => Alert.alert('Error', formatSqliteError(e)));
  }, [reloadMeta, voucherType]);

  useEffect(() => {
    let cancelled = false;
    if (!partyName.trim() || applyMode !== 'against_invoice') {
      setOpenInvoices([]);
      setSelectedInvoiceNo(null);
      return;
    }
    getOpenInvoicesForParty(partyName, voucherType)
      .then((rows) => {
        if (cancelled) return;
        setOpenInvoices(rows);
        setSelectedInvoiceNo((prev) =>
          prev && rows.some((r) => r.invoice_no === prev) ? prev : rows[0]?.invoice_no ?? null
        );
      })
      .catch(() => {
        if (!cancelled) setOpenInvoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [partyName, voucherType, applyMode]);

  const switchType = (type: PaymentVoucherType) => {
    setVoucherType(type);
    setPartyName('');
    setSelectedInvoiceNo(null);
  };

  const handleSave = async () => {
    if (saving) return;
    const amt = parseAmountInput(amount);
    if (!partyName.trim()) {
      Alert.alert('Missing party', voucherType === 'receipt' ? 'Enter customer name' : 'Enter vendor name');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid date');
      return;
    }
    if (!accountId) {
      Alert.alert('Missing account', 'Select a cash/bank account');
      return;
    }
    if (!voucherNo.trim()) {
      Alert.alert('Missing number', 'Enter a voucher number');
      return;
    }
    if (applyMode === 'against_invoice' && !selectedInvoiceNo) {
      Alert.alert(
        'No invoice selected',
        'Pick an open invoice, or switch to Advance / On account.'
      );
      return;
    }

    const billType: PaymentBillType =
      applyMode === 'against_invoice'
        ? 'agst_ref'
        : applyMode === 'advance'
          ? 'advance'
          : 'on_account';

    const account = accounts.find((a) => a.id === accountId);
    const partyLedger = partyName.trim();
    const bankLedger = account?.name ?? 'Cash';

    setSaving(true);
    try {
      const id = await createPaymentVoucher({
        voucher_type: voucherType,
        voucher_no: voucherNo.trim(),
        date,
        party_name: partyLedger,
        party_type: voucherType === 'receipt' ? 'customer' : 'vendor',
        account_id: accountId,
        account_name: bankLedger,
        amount: amt,
        narration: narration.trim() || undefined,
        instrument_no: instrumentNo.trim() || undefined,
        payment_mode: paymentMode.trim() || undefined,
        lines:
          voucherType === 'receipt'
            ? [
                {
                  ledger_name: partyLedger,
                  is_party: true,
                  amount: -amt,
                  is_deemed_positive: true,
                },
                {
                  ledger_name: bankLedger,
                  is_bank_cash: true,
                  amount: amt,
                  is_deemed_positive: false,
                },
              ]
            : [
                {
                  ledger_name: partyLedger,
                  is_party: true,
                  amount: amt,
                  is_deemed_positive: false,
                },
                {
                  ledger_name: bankLedger,
                  is_bank_cash: true,
                  amount: -amt,
                  is_deemed_positive: true,
                },
              ],
        allocations: [
          {
            bill_name:
              applyMode === 'against_invoice'
                ? selectedInvoiceNo!
                : applyMode === 'advance'
                  ? 'Advance'
                  : 'On Account',
            bill_type: billType,
            amount: amt,
          },
        ],
      });
      refresh();
      router.replace(`/(drawer)/payments/${id}` as never);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScreen>
      <View style={styles.typeRow}>
        {(
          [
            { value: 'receipt', label: 'Money In (Receipt)' },
            { value: 'payment', label: 'Money Out (Payment)' },
          ] as { value: PaymentVoucherType; label: string }[]
        ).map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.typeChip, voucherType === opt.value && styles.typeChipActive]}
            onPress={() => switchType(opt.value)}
          >
            <Text
              style={[
                styles.typeChipText,
                voucherType === opt.value && styles.typeChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.metaRow}>
        <View style={{ flex: 1.1 }}>
          <FormInput label="Voucher No" value={voucherNo} onChangeText={setVoucherNo} />
        </View>
        <View style={{ flex: 1 }}>
          <DatePickerField label="Date" value={date} onChange={setDate} />
        </View>
      </View>

      <CustomerAutocomplete
        label={voucherType === 'receipt' ? 'Customer' : 'Vendor'}
        value={partyName}
        onChange={setPartyName}
        partyType={voucherType === 'receipt' ? 'customer' : 'vendor'}
        placeholder={
          voucherType === 'receipt' ? 'Start typing customer name' : 'Start typing vendor name'
        }
      />

      <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
      <FormInput label="Amount" value={amount} onChangeText={setAmount} money />

      <SectionHeader title="Apply as" />
      <View style={styles.modeRow}>
        {(
          [
            { value: 'against_invoice', label: 'Against invoice' },
            { value: 'advance', label: 'Advance' },
            { value: 'on_account', label: 'On account' },
          ] as { value: ApplyMode; label: string }[]
        ).map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.modeChip, applyMode === opt.value && styles.modeChipActive]}
            onPress={() => setApplyMode(opt.value)}
          >
            <Text
              style={[
                styles.modeChipText,
                applyMode === opt.value && styles.modeChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {applyMode === 'against_invoice' ? (
        <View style={styles.invoiceBox}>
          <Text style={styles.hint}>
            {openInvoices.length === 0
              ? partyName.trim()
                ? 'No open invoices for this party. Use Advance or On account.'
                : 'Select a party to see open invoices.'
              : 'Tap an open invoice to settle:'}
          </Text>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
            {openInvoices.map((inv) => {
              const selected = inv.invoice_no === selectedInvoiceNo;
              return (
                <TouchableOpacity
                  key={inv.id}
                  style={[styles.invoiceRow, selected && styles.invoiceRowActive]}
                  onPress={() => {
                    setSelectedInvoiceNo(inv.invoice_no);
                    if (!amount.trim()) setAmount(String(inv.due));
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invoiceNo}>{inv.invoice_no}</Text>
                    <Text style={styles.invoiceMeta}>{inv.date}</Text>
                  </View>
                  <Text style={styles.invoiceDue}>Due {formatCurrency(inv.due)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <Text style={styles.hint}>
          {applyMode === 'advance'
            ? 'Stored as advance credit for this party (reduces their balance due).'
            : 'Stored on account without linking to a specific invoice.'}
        </Text>
      )}

      <FormInput
        label="Payment mode (optional)"
        value={paymentMode}
        onChangeText={setPaymentMode}
        placeholder="Cash, UPI, NEFT, Cheque…"
      />
      <FormInput
        label="Instrument / Ref no (optional)"
        value={instrumentNo}
        onChangeText={setInstrumentNo}
        placeholder="Cheque no, UPI ref…"
      />
      <FormInput label="Narration" value={narration} onChangeText={setNarration} multiline />

      <PrimaryButton
        title={voucherType === 'receipt' ? 'Save Receipt' : 'Save Payment'}
        onPress={handleSave}
        loading={saving}
      />
    </FormScreen>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    typeRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
    typeChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeChipText: { fontWeight: '600', color: colors.text, fontSize: 13, textAlign: 'center' },
    typeChipTextActive: { color: colors.onPrimary },
    metaRow: { flexDirection: 'row', gap: spacing.sm },
    modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
    modeChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.full,
      backgroundColor: colors.chip,
    },
    modeChipActive: { backgroundColor: colors.primaryContainer },
    modeChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    modeChipTextActive: { color: colors.onPrimaryContainer },
    invoiceBox: {
      marginBottom: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
      padding: spacing.sm,
    },
    hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
    invoiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      minHeight: 44,
    },
    invoiceRowActive: { backgroundColor: colors.navActive },
    invoiceNo: { fontSize: 14, fontWeight: '600', color: colors.text },
    invoiceMeta: { fontSize: 12, color: colors.textSecondary },
    invoiceDue: { fontSize: 13, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  });
}

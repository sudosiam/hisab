import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  SegmentedControl,
} from '../../../src/components/ui';
import { CustomerAutocomplete } from '../../../src/components/CustomerAutocomplete';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { getSelectableAccounts } from '../../../src/services/banking';
import {
  createPaymentVoucher,
  getNextPaymentVoucherNo,
  getOpenInvoicesForParty,
} from '../../../src/services/paymentVouchers';
import { DRAFT_KEYS, loadDraft, type PaymentFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { formatCurrency, parseMoneyInput } from '../../../src/utils/format';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { alertLoadFailed } from '../../../src/utils/uiFeedback';
import { spacing, radius } from '../../../src/constants/theme';
import type { Account, PaymentBillType, PaymentVoucherType } from '../../../src/types';

type ApplyMode = 'against_invoice' | 'advance' | 'on_account';

function isPaymentDraftEmpty(d: PaymentFormDraft): boolean {
  return (
    !d.partyName.trim() &&
    !d.amount.trim() &&
    !d.narration.trim() &&
    !d.instrumentNo.trim() &&
    !d.paymentMode.trim() &&
    d.applyMode === 'against_invoice' &&
    !d.selectedInvoiceNo
  );
}

export default function NewPaymentScreen() {
  const router = useRouter();
  const { refresh } = useDatabaseActions();
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
  const draftHydratedRef = useRef(false);
  const leaveBypassRef = useRef(false);

  const draftPayload = useMemo<PaymentFormDraft>(
    () => ({
      voucherType,
      voucherNo,
      date,
      partyName,
      accountId,
      amount,
      applyMode,
      selectedInvoiceNo,
      narration,
      instrumentNo,
      paymentMode,
    }),
    [
      voucherType,
      voucherNo,
      date,
      partyName,
      accountId,
      amount,
      applyMode,
      selectedInvoiceNo,
      narration,
      instrumentNo,
      paymentMode,
    ]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.paymentNew,
    draftPayload,
    { isEmpty: isPaymentDraftEmpty }
  );

  useUnsavedChangesGuard(!isPaymentDraftEmpty(draftPayload) || hasDraft, {
    bypassRef: leaveBypassRef,
    message: 'You have an unsaved payment draft that will be lost.',
  });

  const reloadMeta = useCallback(async (type: PaymentVoucherType) => {
    const [accs, nextNo] = await Promise.all([
      getSelectableAccounts(),
      getNextPaymentVoucherNo(type),
    ]);
    setAccounts(accs);
    setAccountId((current) =>
      current && accs.some((a) => a.id === current) ? current : accs[0]?.id ?? 0
    );
    // After draft hydration, type switches should fetch a fresh voucher number.
    // During the first load, the mount effect applies draft.voucherNo itself.
    if (draftHydratedRef.current) {
      setVoucherNo(nextNo);
    }
    return { accs, nextNo };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraft<PaymentFormDraft>(DRAFT_KEYS.paymentNew);
        if (cancelled) return;

        const type: PaymentVoucherType =
          draft && !isPaymentDraftEmpty(draft) ? draft.voucherType : 'receipt';

        // Restore voucher type before meta/fields so subsequent type-driven
        // reloads do not race against draft values on first paint.
        if (type !== voucherType) {
          setVoucherType(type);
        }

        const { accs, nextNo } = await reloadMeta(type);
        if (cancelled) return;

        if (draft && !isPaymentDraftEmpty(draft)) {
          setVoucherType(draft.voucherType);
          setVoucherNo(draft.voucherNo || nextNo);
          setDate(isValidISODate(draft.date) ? draft.date : todayISO());
          setPartyName(draft.partyName || '');
          setAccountId(
            draft.accountId && accs.some((a) => a.id === draft.accountId)
              ? draft.accountId
              : accs[0]?.id ?? 0
          );
          setAmount(draft.amount || '');
          setApplyMode(draft.applyMode || 'against_invoice');
          setSelectedInvoiceNo(draft.selectedInvoiceNo ?? null);
          setNarration(draft.narration || '');
          setInstrumentNo(draft.instrumentNo || '');
          setPaymentMode(draft.paymentMode || '');
          noteDraftLoaded();
        } else {
          setVoucherNo(nextNo);
          if (accs.length > 0) setAccountId(accs[0].id);
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      } finally {
        if (!cancelled) {
          draftHydratedRef.current = true;
          markReady();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // voucherType intentionally omitted — only initial hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markReady, noteDraftLoaded, reloadMeta]);

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
      .catch((e) => {
        if (cancelled) return;
        setOpenInvoices([]);
        alertLoadFailed(e);
      });
    return () => {
      cancelled = true;
    };
  }, [partyName, voucherType, applyMode]);

  const resetForm = async (defaultAccountId: number) => {
    setVoucherType('receipt');
    setDate(todayISO());
    setPartyName('');
    setAccountId(defaultAccountId);
    setAmount('');
    setApplyMode('against_invoice');
    setSelectedInvoiceNo(null);
    setNarration('');
    setInstrumentNo('');
    setPaymentMode('');
    try {
      const nextNo = await getNextPaymentVoucherNo('receipt');
      setVoucherNo(nextNo);
    } catch {
      setVoucherNo('');
    }
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved payment will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          await resetForm(accountId || accounts[0]?.id || 0);
        },
      },
    ]);
  };

  const switchType = (type: PaymentVoucherType) => {
    setVoucherType(type);
    setPartyName('');
    setSelectedInvoiceNo(null);
    void reloadMeta(type).catch((e) => Alert.alert('Error', formatSqliteError(e)));
  };

  const handleSave = async () => {
    if (saving) return;
    const amt = parseMoneyInput(amount);
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
      leaveBypassRef.current = true;
      await clearDraftOnSave();
      refresh();
      router.replace(`/(drawer)/payments/${id}` as never);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScreen
      stickyFooter={<DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />}
    >
      <SegmentedControl
        options={[
          { value: 'receipt', label: 'Money In (Receipt)' },
          { value: 'payment', label: 'Money Out (Payment)' },
        ]}
        value={voucherType}
        onChange={switchType}
      />

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
      <SegmentedControl
        options={[
          { value: 'against_invoice', label: 'Against invoice' },
          { value: 'advance', label: 'Advance' },
          { value: 'on_account', label: 'On account' },
        ]}
        value={applyMode}
        onChange={setApplyMode}
      />

      {applyMode === 'against_invoice' ? (
        <View style={styles.invoiceBox}>
          <Text style={styles.hint}>
            {openInvoices.length === 0
              ? partyName.trim()
                ? 'No open invoices.'
                : 'Select a party first.'
              : 'Select an invoice:'}
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
      ) : null}

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
    metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
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

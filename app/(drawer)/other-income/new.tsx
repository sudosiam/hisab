import React, { useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  SectionHeader,
} from '../../../src/components/ui';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { otherIncomeCategorySource } from '../../../src/components/categorySources';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { createOtherIncome } from '../../../src/services/otherIncome';
import { getSelectableAccounts } from '../../../src/services/banking';
import { DRAFT_KEYS, loadDraft, type OtherIncomeFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { parsePositiveAmount } from '../../../src/utils/format';
import type { Account } from '../../../src/types';

function isOtherIncomeDraftEmpty(d: OtherIncomeFormDraft): boolean {
  return !d.category.trim() && !d.description.trim() && !d.amount.trim();
}

export default function NewOtherIncomeScreen() {
  const router = useRouter();
  const { refresh, refreshKey } = useDatabase();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [loading, setLoading] = useState(false);
  const leaveBypassRef = useRef(false);

  const draftPayload = useMemo<OtherIncomeFormDraft>(
    () => ({
      category,
      description,
      amount,
      date,
      accountId,
    }),
    [category, description, amount, date, accountId]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.otherIncomeNew,
    draftPayload,
    { isEmpty: isOtherIncomeDraftEmpty }
  );

  useUnsavedChangesGuard(!isOtherIncomeDraftEmpty(draftPayload) || hasDraft, {
    bypassRef: leaveBypassRef,
    message: 'You have an unsaved other income draft that will be lost.',
  });

  const resetForm = (defaultAccountId: number) => {
    setCategory('');
    setDescription('');
    setAmount('');
    setDate(todayISO());
    setAccountId(defaultAccountId);
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved other income will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          resetForm(accountId || accounts[0]?.id || 0);
        },
      },
    ]);
  };

  const reloadAccounts = React.useCallback(async () => {
    try {
      const a = await getSelectableAccounts();
      setAccounts(a);
      setAccountId((current) =>
        current && a.some((acc) => acc.id === current) ? current : a[0]?.id ?? 0
      );
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refreshKey;
      void reloadAccounts();
    }, [reloadAccounts, refreshKey])
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await getSelectableAccounts();
        if (cancelled) return;
        setAccounts(a);
        const defaultAccount = a[0]?.id ?? 0;
        const draft = await loadDraft<OtherIncomeFormDraft>(DRAFT_KEYS.otherIncomeNew);
        if (cancelled) return;
        if (draft && !isOtherIncomeDraftEmpty(draft)) {
          setCategory(draft.category || '');
          setDescription(draft.description || '');
          setAmount(draft.amount || '');
          setDate(isValidISODate(draft.date) ? draft.date : todayISO());
          setAccountId(
            draft.accountId && a.some((acc) => acc.id === draft.accountId)
              ? draft.accountId
              : defaultAccount
          );
          noteDraftLoaded();
        } else if (a.length > 0) {
          setAccountId(defaultAccount);
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      } finally {
        if (!cancelled) markReady();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markReady, noteDraftLoaded]);

  const handleSave = async () => {
    if (loading) return;
    const amt = parsePositiveAmount(amount);
    if (!category.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Category, description, amount, and account are required');
      return;
    }
    if (amt === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid income date');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Select a bank/cash account');
      return;
    }
    setLoading(true);
    try {
      const id = await createOtherIncome({
        category: category.trim(),
        description: description.trim(),
        amount: amt,
        account_id: accountId,
        date,
      });
      leaveBypassRef.current = true;
      await clearDraftOnSave();
      refresh();
      router.replace(`/(drawer)/other-income/${id}` as never);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen>
      <DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />
      <SectionHeader title="New Other Income" />
      <CategoryPicker
        value={category}
        onChange={setCategory}
        source={otherIncomeCategorySource}
      />
      <FormInput label="Description" value={description} onChangeText={setDescription} />
      <FormInput
        label="Amount (₹)"
        value={amount}
        onChangeText={setAmount}
        money
      />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
      <PrimaryButton title="Save Other Income" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

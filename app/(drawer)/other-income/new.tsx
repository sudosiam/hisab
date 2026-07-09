import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
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
import { createOtherIncome } from '../../../src/services/otherIncome';
import { getSelectableAccounts } from '../../../src/services/banking';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { parsePositiveAmount } from '../../../src/utils/format';
import type { Account } from '../../../src/types';

export default function NewOtherIncomeScreen() {
  const router = useRouter();
  const { refresh } = useDatabase();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getSelectableAccounts()
      .then((a) => {
        if (cancelled) return;
        setAccounts(a);
        if (a.length > 0) setAccountId(a[0].id);
      })
      .catch((e) => {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

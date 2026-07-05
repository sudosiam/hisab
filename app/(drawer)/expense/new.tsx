import React, { useState } from 'react';
import { ScrollView, Alert, Switch, TouchableOpacity, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { createExpense, getAccounts } from '../../../src/services/banking';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO } from '../../../src/utils/date';
import { spacing, radius } from '../../../src/constants/theme';
import type { Account } from '../../../src/types';

const RECURRENCE_OPTIONS = ['Monthly', 'Weekly', 'Yearly'];

export default function NewExpenseScreen() {
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState('Monthly');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    getAccounts().then((a) => {
      setAccounts(a);
      if (a.length > 0) setAccountId(a[0].id);
    });
  }, []);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!category.trim() || !description.trim() || !amt) {
      Alert.alert('Error', 'Fill all fields');
      return;
    }
    setLoading(true);
    try {
      const id = await createExpense({
        category: category.trim(),
        description: description.trim(),
        amount: amt,
        account_id: accountId,
        date,
        is_recurring: isRecurring,
        recurrence: isRecurring ? recurrence : undefined,
      });
      refresh();
      router.replace(`/(drawer)/expense/${id}` as never);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionHeader title="New Expense" />
      <FormInput label="Category" value={category} onChangeText={setCategory} placeholder="Rent, Salary..." />
      <FormInput label="Description" value={description} onChangeText={setDescription} />
      <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <FormInput label="Date" value={date} onChangeText={setDate} />
      <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />

      <View style={[styles.row, { marginVertical: spacing.sm }]}>
        <Text style={styles.label}>Recurring Expense</Text>
        <Switch
          value={isRecurring}
          onValueChange={setIsRecurring}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      {isRecurring ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
          {RECURRENCE_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: recurrence === r ? colors.primary : colors.border,
                backgroundColor: recurrence === r ? colors.primary : colors.surface,
              }}
              onPress={() => setRecurrence(r)}
            >
              <Text style={{ color: recurrence === r ? colors.onPrimary : colors.text, fontWeight: '600', fontSize: 12 }}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <PrimaryButton title="Save Expense" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

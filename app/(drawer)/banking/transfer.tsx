import React, { useEffect, useMemo, useState } from 'react';
import { Alert, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  useScreenStyles,
} from '../../../src/components/ui';
import { getPaymentAccounts, transferBetweenAccounts } from '../../../src/services/banking';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { parsePositiveAmount } from '../../../src/utils/format';
import { radius, spacing } from '../../../src/constants/theme';
import type { Account } from '../../../src/types';

export default function TransferScreen() {
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          padding: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
        },
        chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { color: colors.text, fontSize: 14 },
        chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
      }),
    [colors]
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fromId, setFromId] = useState(0);
  const [toId, setToId] = useState(0);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPaymentAccounts()
      .then((a) => {
        if (cancelled) return;
        setAccounts(a);
        if (a.length > 0) setFromId(a[0].id);
        if (a.length > 1) setToId(a[1].id);
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
    if (amt === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!fromId || !toId) {
      Alert.alert('Error', 'Select both accounts. You need at least two accounts to transfer.');
      return;
    }
    if (fromId === toId) {
      Alert.alert('Error', 'Choose two different accounts');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid transfer date');
      return;
    }
    setLoading(true);
    try {
      await transferBetweenAccounts({
        from_account_id: fromId,
        to_account_id: toId,
        amount: amt,
        date,
        description: description.trim() || undefined,
      });
      refresh();
      router.back();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen>
      <Text style={styles.label}>From Account</Text>
      {accounts.map((a) => (
        <TouchableOpacity
          key={`from-${a.id}`}
          style={[localStyles.chip, fromId === a.id && localStyles.chipActive]}
          onPress={() => setFromId(a.id)}
        >
          <Text style={fromId === a.id ? localStyles.chipTextActive : localStyles.chipText}>{a.name}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>To Account</Text>
      {accounts.map((a) => (
        <TouchableOpacity
          key={`to-${a.id}`}
          style={[localStyles.chip, toId === a.id && localStyles.chipActive]}
          onPress={() => setToId(a.id)}
        >
          <Text style={toId === a.id ? localStyles.chipTextActive : localStyles.chipText}>{a.name}</Text>
        </TouchableOpacity>
      ))}

      <FormInput label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <FormInput label="Note (optional)" value={description} onChangeText={setDescription} />
      <PrimaryButton title="Transfer" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

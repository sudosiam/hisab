import React, { useMemo, useState, useCallback } from 'react';
import { Alert, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
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
import { formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { radius, spacing } from '../../../src/constants/theme';
import type { Account } from '../../../src/types';

export default function TransferScreen() {
  const router = useRouter();
  const { refresh, refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        },
        chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { color: colors.text, fontSize: 14, flex: 1, minWidth: 0 },
        chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
        chipBal: {
          color: colors.textSecondary,
          fontSize: 12,
          fontVariant: ['tabular-nums'],
          flexShrink: 0,
        },
        chipBalActive: { color: colors.onPrimary, opacity: 0.9 },
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

  useUnsavedChangesGuard(amount.trim() !== '' || description.trim() !== '');

  const reloadAccounts = useCallback(async () => {
    try {
      const a = await getPaymentAccounts();
      setAccounts(a);
      setFromId((current) => (current && a.some((acc) => acc.id === current) ? current : a[0]?.id ?? 0));
      setToId((current) => {
        if (current && a.some((acc) => acc.id === current)) return current;
        return a.length > 1 ? a[1].id : a[0]?.id ?? 0;
      });
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshKey;
      void reloadAccounts();
    }, [reloadAccounts, refreshKey])
  );

  const needsMoreAccounts = accounts.length < 2;

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
      {needsMoreAccounts ? (
        <View
          style={{
            marginBottom: spacing.md,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
            Add at least two bank or cash accounts in Banking before you can transfer between them.
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>From Account</Text>
      {accounts.map((a) => {
        const active = fromId === a.id;
        return (
          <TouchableOpacity
            key={`from-${a.id}`}
            style={[localStyles.chip, active && localStyles.chipActive]}
            onPress={() => setFromId(a.id)}
          >
            <Text style={active ? localStyles.chipTextActive : localStyles.chipText} numberOfLines={1}>
              {a.name}
            </Text>
            <Text style={[localStyles.chipBal, active && localStyles.chipBalActive]} numberOfLines={1}>
              {formatCurrency(a.current_balance)}
            </Text>
          </TouchableOpacity>
        );
      })}

      <Text style={styles.label}>To Account</Text>
      {accounts.map((a) => {
        const active = toId === a.id;
        return (
          <TouchableOpacity
            key={`to-${a.id}`}
            style={[localStyles.chip, active && localStyles.chipActive]}
            onPress={() => setToId(a.id)}
          >
            <Text style={active ? localStyles.chipTextActive : localStyles.chipText} numberOfLines={1}>
              {a.name}
            </Text>
            <Text style={[localStyles.chipBal, active && localStyles.chipBalActive]} numberOfLines={1}>
              {formatCurrency(a.current_balance)}
            </Text>
          </TouchableOpacity>
        );
      })}

      <FormInput label="Amount" value={amount} onChangeText={setAmount} money />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <FormInput label="Note (optional)" value={description} onChangeText={setDescription} />
      <PrimaryButton
        title="Transfer"
        onPress={handleSave}
        loading={loading}
        disabled={needsMoreAccounts}
      />
    </FormScreen>
  );
}

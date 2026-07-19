import React, { useLayoutEffect, useMemo, useState, useCallback } from 'react';
import { Alert, Text, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { FormInput, FormScreen, PrimaryButton, DatePickerField, useScreenStyles } from '../../../src/components/ui';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { getSelectableAccounts, recordDeposit, recordWithdrawal } from '../../../src/services/banking';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { todayISO, isValidISODate } from '../../../src/utils/date';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import type { Account } from '../../../src/types';

type Mode = 'deposit' | 'withdraw';

export default function CashMovementScreen() {
  const { mode: modeParam, accountId: accountIdParam } = useLocalSearchParams<{
    mode?: string;
    accountId?: string;
  }>();
  const mode: Mode = modeParam === 'withdraw' ? 'withdraw' : 'deposit';
  const router = useRouter();
  const navigation = useNavigation();
  const { refresh, refreshKey } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        info: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
      }),
    [colors, isDark]
  );

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useUnsavedChangesGuard(amount.trim() !== '' || description.trim() !== '');

  useLayoutEffect(() => {
    navigation.setOptions({ title: mode === 'deposit' ? 'Deposit' : 'Withdraw' });
  }, [mode, navigation]);

  const reloadAccounts = useCallback(async () => {
    try {
      const a = await getSelectableAccounts();
      setAccounts(a);
      setAccountId((current) => {
        const preselected = accountIdParam ? parseInt(accountIdParam, 10) : 0;
        if (preselected && a.some((acc) => acc.id === preselected)) return preselected;
        if (current && a.some((acc) => acc.id === current)) return current;
        return a[0]?.id ?? 0;
      });
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [accountIdParam]);

  useFocusEffect(
    useCallback(() => {
      void reloadAccounts();
    }, [reloadAccounts, refreshKey])
  );

  const selected = accounts.find((a) => a.id === accountId);

  const handleSave = async () => {
    if (loading) return;
    const amt = parsePositiveAmount(amount);
    if (amt === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid transaction date');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Select an account');
      return;
    }
    if (mode === 'withdraw' && selected && amt > selected.current_balance + 0.01) {
      Alert.alert(
        'Insufficient balance',
        `This account has only ${formatCurrency(selected.current_balance)} available.`
      );
      return;
    }
    setLoading(true);
    try {
      const payload = {
        account_id: accountId,
        amount: amt,
        date,
        description: description.trim() || undefined,
      };
      if (mode === 'deposit') {
        await recordDeposit(payload);
      } else {
        await recordWithdrawal(payload);
      }
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
      <View style={localStyles.info}>
        <Text style={localStyles.infoText}>
          {mode === 'deposit'
            ? 'Record money added to an account (e.g. cash deposited in bank).'
            : 'Record money taken out of an account. Balance must be sufficient.'}
        </Text>
        {selected ? (
          <Text style={[styles.cardSub, { marginTop: spacing.sm }]}>
            Current balance: {formatCurrency(selected.current_balance)}
          </Text>
        ) : null}
      </View>

      <AccountPicker
        label="Account"
        accounts={accounts}
        value={accountId}
        onChange={setAccountId}
      />
      <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} money />
      <DatePickerField label="Date" value={date} onChange={setDate} />
      <FormInput
        label="Note (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder={mode === 'deposit' ? 'Cash deposit, owner capital...' : 'Cash withdrawal, owner draw...'}
      />
      <PrimaryButton
        title={mode === 'deposit' ? 'Record Deposit' : 'Record Withdrawal'}
        onPress={handleSave}
        loading={loading}
      />
    </FormScreen>
  );
}

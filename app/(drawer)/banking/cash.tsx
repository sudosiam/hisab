import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ScrollView, Alert, Text, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { FormInput, PrimaryButton, useScreenStyles } from '../../../src/components/ui';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { getAccounts, recordDeposit, recordWithdrawal } from '../../../src/services/banking';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatCurrency } from '../../../src/utils/format';
import { todayISO } from '../../../src/utils/date';
import { spacing, radius } from '../../../src/constants/theme';
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
  const { refresh } = useDatabase();
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

  useLayoutEffect(() => {
    navigation.setOptions({ title: mode === 'deposit' ? 'Deposit' : 'Withdraw' });
  }, [mode, navigation]);

  useEffect(() => {
    getAccounts().then((a) => {
      setAccounts(a);
      const preselected = accountIdParam ? parseInt(accountIdParam, 10) : 0;
      if (preselected && a.some((acc) => acc.id === preselected)) {
        setAccountId(preselected);
      } else if (a.length > 0) {
        setAccountId(a[0].id);
      }
    });
  }, [accountIdParam]);

  const selected = accounts.find((a) => a.id === accountId);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt) {
      Alert.alert('Error', 'Enter a valid amount');
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
      <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <FormInput label="Date" value={date} onChangeText={setDate} />
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
    </ScrollView>
  );
}

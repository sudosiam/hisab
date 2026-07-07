import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  ErrorState,
  FormInput,
  FormScreen,
  PrimaryButton,
  SectionHeader,
  useScreenStyles,
} from '../../src/components/ui';
import { getInvestmentInfo, setOwnerInvestment } from '../../src/services/investments';
import { formatSqliteError } from '../../src/db/database';
import { formatAmountInput, formatCurrency, normalizeAmountInput } from '../../src/utils/format';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { InvestmentInfo } from '../../src/services/investments';

export default function InvestmentsScreen() {
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...cardSurface(colors, isDark),
          padding: spacing.lg,
          marginBottom: spacing.md,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textMuted, textTransform: 'uppercase' },
        heroValue: { ...typography.display, color: colors.primary, marginTop: spacing.sm },
        heroHint: {
          fontSize: 13,
          color: colors.textSecondary,
          marginTop: spacing.sm,
          textAlign: 'center',
        },
        note: {
          fontSize: 13,
          color: colors.textSecondary,
          marginBottom: spacing.md,
          lineHeight: 20,
        },
      }),
    [colors, isDark]
  );

  const [info, setInfo] = useState<InvestmentInfo | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = React.useRef(false);
  const dirtyRef = React.useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const data = await getInvestmentInfo();
      setInfo(data);
      // Don't clobber a value the user is currently typing.
      if (!dirtyRef.current) {
        setAmount(data.isSet ? formatAmountInput(data.amount) : '');
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load investment info');
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAmountChange = (value: string) => {
    dirtyRef.current = true;
    setAmount(value);
  };

  const handleSave = async () => {
    if (saving) return;
    const parsed = parseFloat(normalizeAmountInput(amount));
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert('Error', 'Enter a valid investment amount');
      return;
    }
    setSaving(true);
    try {
      await setOwnerInvestment(parsed);
      dirtyRef.current = false;
      refresh();
      await load();
      Alert.alert('Saved', 'Your investment amount has been updated.');
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  if (error && !info) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (loading || !info) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FormScreen>
      <View style={localStyles.hero}>
        <Text style={localStyles.heroLabel}>You invested</Text>
        <Text style={localStyles.heroValue}>
          {info.isSet ? formatCurrency(info.amount) : '—'}
        </Text>
        <Text style={localStyles.heroHint}>
          {info.isSet ? 'Used on Growth for ahead/behind and return' : 'Set your amount below'}
        </Text>
      </View>

      <Text style={localStyles.note}>
        Enter the total money you put into this business. Growth uses only this amount for
        ahead/behind and return on money in.
      </Text>

      <SectionHeader title="Set investment" />
      <FormInput
        label="Total invested (₹)"
        value={amount}
        onChangeText={handleAmountChange}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      <PrimaryButton title="Save Investment" onPress={handleSave} loading={saving} />
    </FormScreen>
  );
}

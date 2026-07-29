import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Text, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  ErrorState,
  FormInput,
  FormScreen,
  PrimaryButton,
  SectionHeader,
  SummaryHero,
} from '../../src/components/ui';
import { getInvestmentInfo, setOwnerInvestment } from '../../src/services/investments';
import { formatSqliteError } from '../../src/db/database';
import { formatAmountInput, parseMoneyInput } from '../../src/utils/format';
import { DetailSkeleton } from '../../src/components/Skeleton';
import { useDatabaseActions } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import { spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { InvestmentInfo } from '../../src/services/investments';

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function InvestmentsScreen() {
  const { refresh } = useDatabaseActions();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hintCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        hint: {
          ...typography.caption,
          color: colors.textSecondary,
          lineHeight: 18,
        },
        updated: {
          ...typography.micro,
          color: colors.textMuted,
          marginTop: spacing.xs,
          textAlign: 'center',
        },
      }),
    [colors, isDark]
  );

  const [info, setInfo] = useState<InvestmentInfo | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const hasLoadedRef = React.useRef(false);
  const dirtyRef = React.useRef(false);

  useUnsavedChangesGuard(dirty);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const data = await getInvestmentInfo();
      setInfo(data);
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAmountChange = (value: string) => {
    dirtyRef.current = true;
    setDirty(true);
    setAmount(value);
  };

  const handleSave = async () => {
    if (saving) return;
    const parsed = parseMoneyInput(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert('Error', 'Enter a valid investment amount');
      return;
    }
    setSaving(true);
    try {
      await setOwnerInvestment(parsed);
      dirtyRef.current = false;
      setDirty(false);
      refresh();
      await load();
      Alert.alert('Saved', 'Owner capital updated for Growth ROI.');
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  if (error && !info) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (loading && !info) {
    return <DetailSkeleton />;
  }

  if (!info) {
    return <ErrorState message={error ?? 'Failed to load investment info'} onRetry={load} />;
  }

  const updatedLabel = formatUpdatedAt(info.updatedAt);

  return (
    <FormScreen>
      <SummaryHero
        label="Owner capital"
        amount={info.isSet ? info.amount : 0}
        hint={
          info.isSet
            ? 'Used on Growth for ahead/behind and ROI'
            : 'Not set yet — enter total money you put into the business'
        }
      />
      {updatedLabel ? <Text style={localStyles.updated}>Last saved {updatedLabel}</Text> : null}

      <View style={localStyles.hintCard}>
        <Text style={localStyles.hint}>
          This is a single owner-capital figure for Growth — not an investment portfolio. It does
          not create banking transactions.
        </Text>
      </View>

      <SectionHeader title="Set investment" />
      <FormInput
        label="Total invested (₹)"
        value={amount}
        onChangeText={handleAmountChange}
        money
      />

      <PrimaryButton title="Save Investment" onPress={handleSave} loading={saving} />
    </FormScreen>
  );
}

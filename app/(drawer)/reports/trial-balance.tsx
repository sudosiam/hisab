import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { LedgerTable } from '../../../src/components/LedgerTable';
import { getTrialBalanceReport } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareTrialBalancePdf } from '../../../src/services/reportPdf';
import { spacing, typography } from '../../../src/constants/theme';
import { formatSqliteError } from '../../../src/db/database';
import { formatCurrency } from '../../../src/utils/format';

export default function TrialBalanceReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof getTrialBalanceReport>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [booting, setBooting] = useState(true);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hero: { marginBottom: spacing.md },
        heroLabel: { ...typography.section, color: colors.textSecondary, textTransform: 'uppercase' },
        heroHint: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
        balanced: { marginTop: spacing.md, paddingVertical: spacing.sm },
        balancedText: { textAlign: 'center', color: colors.textSecondary, fontSize: 13 },
      }),
    [colors]
  );

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setData(await getTrialBalanceReport());
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setBooting(false);
    }
  }, [refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const ledgerRows = useMemo(
    () =>
      (data?.rows ?? []).map((row, index) => ({
        id: `tb-${index}`,
        date: '',
        description: row.account,
        debit: row.debit,
        credit: row.credit,
        balance: 0,
      })),
    [data]
  );

  const exportPdf = useCallback(async () => {
    if (!data) return { success: false, message: 'Report not loaded yet.' };
    return shareTrialBalancePdf(data);
  }, [data]);

  useReportPdfHeader({ disabled: !data || !!error, onExport: exportPdf });

  if (error && !data) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (booting && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const balanced = data ? Math.abs(data.totalDebit - data.totalCredit) < 0.02 : false;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={localStyles.hero}>
        <Text style={localStyles.heroLabel}>Trial Balance</Text>
        <Text style={localStyles.heroHint}>
          Double-entry snapshot — total debits must equal total credits.
        </Text>
      </View>

      {data ? (
        <LedgerTable
          rows={ledgerRows}
          showDate={false}
          showBalance={false}
          emptyText="No ledger balances yet."
          footerRows={[
            {
              label: 'Total',
              debit: data.totalDebit,
              credit: data.totalCredit,
            },
          ]}
        />
      ) : null}

      {data ? (
        <View style={localStyles.balanced}>
          <Text style={localStyles.balancedText}>
            {balanced
              ? 'Books are balanced — total debits equal total credits.'
              : `Difference: ${formatCurrency(Math.abs(data.totalDebit - data.totalCredit))}`}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

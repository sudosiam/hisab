import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { ErrorState, useScreenStyles } from '../../../src/components/ui';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { LedgerTable } from '../../../src/components/LedgerTable';
import { getTrialBalanceReport } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareTrialBalancePdf } from '../../../src/services/reportPdf';
import { spacing, typography } from '../../../src/constants/theme';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import { formatCurrency } from '../../../src/utils/format';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';

export default function TrialBalanceReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof getTrialBalanceReport>> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    setData(await getTrialBalanceReport());
  }, [refreshKey]);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      alertRefreshFailed(e);
    } finally {
      setRefreshing(false);
    }
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
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && !data) {
    return <ListSkeleton />;
  }

  const balanced = data ? Math.abs(data.totalDebit - data.totalCredit) < 0.02 : false;

  return (
    <LedgerTable
      style={styles.container}
      contentContainerStyle={styles.content}
      rows={ledgerRows}
      showDate={false}
      showBalance={false}
      emptyText="No ledger balances yet."
      footerRows={
        data
          ? [
              {
                label: 'Total',
                debit: data.totalDebit,
                credit: data.totalCredit,
              },
            ]
          : undefined
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={localStyles.hero}>
          <Text style={localStyles.heroLabel}>Trial Balance</Text>
          <Text style={localStyles.heroHint}>
            Double-entry snapshot — total debits must equal total credits.
          </Text>
        </View>
      }
      ListFooterComponent={
        data ? (
          <View style={localStyles.balanced}>
            <Text style={localStyles.balancedText}>
              {balanced
                ? 'Books are balanced — total debits equal total credits.'
                : `Difference: ${formatCurrency(Math.abs(data.totalDebit - data.totalCredit))}`}
            </Text>
          </View>
        ) : null
      }
    />
  );
}

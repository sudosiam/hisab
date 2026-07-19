import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DatePickerField, ErrorState, useScreenStyles } from '../../../src/components/ui';
import { LedgerTable } from '../../../src/components/LedgerTable';
import { getDayBookFromLedger, hasGeneralLedger } from '../../../src/services/ledger';
import { getDayBookReport } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareDayBookPdf } from '../../../src/services/reportPdf';
import { radius, spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { formatSqliteError } from '../../../src/db/database';
import { getCurrentMonthKey, getMonthRange, isValidISODate, todayISO } from '../../../src/utils/date';
import { MoneyText } from '../../../src/components/MoneyText';
import { roundMoney } from '../../../src/utils/money';
import type { PartyStatementLine } from '../../../src/types';

export default function DayBookReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const monthRange = useMemo(() => getMonthRange(getCurrentMonthKey()), []);

  const [fromDate, setFromDate] = useState(monthRange.start);
  const [toDate, setToDate] = useState(todayISO());
  const [rows, setRows] = useState<PartyStatementLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [booting, setBooting] = useState(true);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.md,
          borderRadius: radius.md,
        },
        dateRow: { flexDirection: 'row', gap: spacing.sm },
        dateField: { flex: 1 },
        totals: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        totalChip: {
          flex: 1,
          minWidth: 0,
          ...cardSurface(colors, isDark),
          padding: spacing.sm,
          borderRadius: radius.sm,
        },
        totalLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' },
        totalValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    void refreshKey;
    if (!isValidISODate(fromDate) || !isValidISODate(toDate)) {
      setRows([]);
      setHint('Choose valid from and to dates.');
      setError(null);
      setBooting(false);
      return;
    }
    if (fromDate > toDate) {
      setRows([]);
      setHint('From date must be on or before the to date.');
      setError(null);
      setBooting(false);
      return;
    }
    try {
      if (await hasGeneralLedger()) {
        setRows(await getDayBookFromLedger(fromDate, toDate));
      } else {
        const legacy = await getDayBookReport(fromDate, toDate);
        let balance = 0;
        setRows(
          legacy.map((row) => {
            balance = roundMoney(balance + row.debit - row.credit);
            return {
              id: row.id,
              date: row.date,
              description: `${row.voucherType} ${row.voucherNo} — ${row.particulars}`,
              debit: row.debit,
              credit: row.credit,
              balance,
              reference_type: 'payment' as const,
              reference_id: 0,
            };
          })
        );
      }
      setHint(null);
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setBooting(false);
    }
  }, [fromDate, toDate, refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totalDebit = roundMoney(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = roundMoney(rows.reduce((sum, row) => sum + row.credit, 0));

  const exportPdf = useCallback(async () => {
    if (hint) return { success: false, message: hint };
    return shareDayBookPdf(fromDate, toDate, rows, totalDebit, totalCredit);
  }, [fromDate, toDate, rows, totalDebit, totalCredit, hint]);

  useReportPdfHeader({ disabled: !!error || !!hint, onExport: exportPdf });

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={localStyles.header}>
        <View style={localStyles.dateRow}>
          <View style={localStyles.dateField}>
            <DatePickerField label="From" value={fromDate} onChange={setFromDate} />
          </View>
          <View style={localStyles.dateField}>
            <DatePickerField label="To" value={toDate} onChange={setToDate} />
          </View>
        </View>
      </View>

      {hint ? <Text style={styles.empty}>{hint}</Text> : null}

      {!hint ? (
        <>
          <View style={localStyles.totals}>
            <View style={localStyles.totalChip}>
              <Text style={localStyles.totalLabel}>Total Debit</Text>
              <MoneyText amount={totalDebit} size="md" style={{ marginTop: 2, textAlign: 'left' }} />
            </View>
            <View style={localStyles.totalChip}>
              <Text style={localStyles.totalLabel}>Total Credit</Text>
              <MoneyText amount={totalCredit} size="md" style={{ marginTop: 2, textAlign: 'left' }} />
            </View>
          </View>
          <LedgerTable rows={rows} emptyText="No journal entries in this date range." />
        </>
      ) : null}
    </ScrollView>
  );
}

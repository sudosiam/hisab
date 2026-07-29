import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DatePickerField, ErrorState, useScreenStyles } from '../../../src/components/ui';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { LedgerTable } from '../../../src/components/LedgerTable';
import { getDayBookFromLedger, hasGeneralLedger } from '../../../src/services/ledger';
import { getDayBookReport } from '../../../src/services/reports';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareDayBookPdf } from '../../../src/services/reportPdf';
import { radius, spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';
import {
  getCurrentMonthKey,
  getMonthRange,
  isValidISODate,
  todayISO,
} from '../../../src/utils/date';
import { MoneyText } from '../../../src/components/MoneyText';
import { roundMoney } from '../../../src/utils/money';
import { alertRefreshFailed } from '../../../src/utils/uiFeedback';
import type { PartyStatementLine } from '../../../src/types';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function DayBookReportScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; month?: string }>();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const monthRange = useMemo(() => getMonthRange(getCurrentMonthKey()), []);

  const [fromDate, setFromDate] = useState(monthRange.start);
  const [toDate, setToDate] = useState(todayISO());
  const [rows, setRows] = useState<PartyStatementLine[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const date = firstParam(params.date);
    const month = firstParam(params.month);
    if (date && isValidISODate(date)) {
      setFromDate(date);
      setToDate(date);
      return;
    }
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const range = getMonthRange(month);
      setFromDate(range.start);
      setToDate(range.end);
    }
  }, [params.date, params.month]);

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
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    void refreshKey;
    if (!isValidISODate(fromDate) || !isValidISODate(toDate)) {
      setRows([]);
      setHint('Choose valid from and to dates.');
      return;
    }
    if (fromDate > toDate) {
      setRows([]);
      setHint('From date must be on or before the to date.');
      return;
    }
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
  }, [fromDate, toDate, refreshKey]);

  const { booting, error, retry } = useFocusRefresh(load, [fromDate, toDate, refreshKey]);

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

  const onRowPress = useCallback(
    (row: PartyStatementLine | { id: string; reference_type?: string; reference_id?: number }) => {
      const full = rows.find((r) => r.id === row.id) ?? (row as PartyStatementLine);
      if (!full.reference_id) return;
      if (full.reference_type === 'sale') {
        router.push(`/(drawer)/sales/${full.reference_id}` as never);
      } else if (full.reference_type === 'purchase') {
        router.push(`/(drawer)/purchases/${full.reference_id}` as never);
      } else {
        router.push(`/(drawer)/payments/${full.reference_id}` as never);
      }
    },
    [router, rows]
  );

  const totalDebit = roundMoney(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = roundMoney(rows.reduce((sum, row) => sum + row.credit, 0));

  const exportPdf = useCallback(async () => {
    if (hint) return { success: false, message: hint };
    return shareDayBookPdf(fromDate, toDate, rows, totalDebit, totalCredit);
  }, [fromDate, toDate, rows, totalDebit, totalCredit, hint]);

  useReportPdfHeader({ disabled: !!error || !!hint, onExport: exportPdf });

  if (error && rows.length === 0) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && rows.length === 0) {
    return <ListSkeleton />;
  }

  return (
    <LedgerTable
      style={styles.container}
      contentContainerStyle={styles.content}
      rows={hint ? [] : rows}
      emptyText={hint ?? 'No journal entries in this date range.'}
      onRowPress={onRowPress}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <>
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

          {!hint ? (
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
          ) : null}
        </>
      }
    />
  );
}

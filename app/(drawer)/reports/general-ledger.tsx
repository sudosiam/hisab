import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DatePickerField, ErrorState, useScreenStyles } from '../../../src/components/ui';
import { LedgerTable } from '../../../src/components/LedgerTable';
import { getGeneralLedgerReport } from '../../../src/services/ledger';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareGeneralLedgerPdf } from '../../../src/services/reportPdf';
import { spacing } from '../../../src/constants/theme';
import { formatSqliteError } from '../../../src/db/database';
import { getCurrentMonthKey, getMonthRange, isValidISODate, todayISO } from '../../../src/utils/date';

export default function GeneralLedgerReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const monthRange = useMemo(() => getMonthRange(getCurrentMonthKey()), []);

  const [fromDate, setFromDate] = useState(monthRange.start);
  const [toDate, setToDate] = useState(todayISO());
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getGeneralLedgerReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { marginBottom: spacing.md },
        dateRow: { flexDirection: 'row', gap: spacing.sm },
        dateField: { flex: 1 },
        hint: { marginBottom: spacing.md, color: colors.textSecondary, fontSize: 13 },
      }),
    [colors]
  );

  const load = useCallback(async () => {
    void refreshKey;
    if (!isValidISODate(fromDate) || !isValidISODate(toDate)) {
      setRows([]);
      setHint('Choose valid from and to dates.');
      setError(null);
      return;
    }
    if (fromDate > toDate) {
      setRows([]);
      setHint('From date must be on or before the to date.');
      setError(null);
      return;
    }
    setHint(null);
    try {
      setRows(await getGeneralLedgerReport(fromDate, toDate));
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    }
  }, [fromDate, toDate, refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ledgerRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        date: row.date,
        description: `${row.accountName} — ${row.description}`,
        debit: row.debit,
        credit: row.credit,
        balance: 0,
      })),
    [rows]
  );

  const exportPdf = useCallback(async () => {
    if (!isValidISODate(fromDate) || !isValidISODate(toDate) || fromDate > toDate) {
      return { success: false, message: 'Choose a valid date range.' };
    }
    return shareGeneralLedgerPdf(fromDate, toDate, rows);
  }, [fromDate, toDate, rows]);

  useReportPdfHeader({
    disabled:
      !!error ||
      !isValidISODate(fromDate) ||
      !isValidISODate(toDate) ||
      fromDate > toDate,
    onExport: exportPdf,
  });

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load().finally(() => setRefreshing(false));
          }}
          tintColor={colors.primary}
        />
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

      {hint ? <Text style={localStyles.hint}>{hint}</Text> : null}

      <LedgerTable
        rows={ledgerRows}
        showBalance={false}
        emptyText="No general ledger entries in this date range."
      />
    </ScrollView>
  );
}

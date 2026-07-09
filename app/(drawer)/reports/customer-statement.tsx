import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CustomerPickerField } from '../../../src/components/VendorPickerField';
import { LedgerTable } from '../../../src/components/LedgerTable';
import { DatePickerField, ErrorState, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';
import { formatSqliteError } from '../../../src/db/database';
import {
  getPartyByName,
  getPartyStatementInRange,
} from '../../../src/services/parties';
import { sharePartyStatementPdf } from '../../../src/services/partyStatementPdf';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { getCurrentMonthKey, getMonthRange, isValidISODate, todayISO } from '../../../src/utils/date';
import { MoneyText } from '../../../src/components/MoneyText';
import type { Party } from '../../../src/types';

export default function CustomerStatementReportScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const monthRange = useMemo(() => getMonthRange(getCurrentMonthKey()), []);

  const [customerName, setCustomerName] = useState('');
  const [customerParty, setCustomerParty] = useState<Party | null>(null);
  const [fromDate, setFromDate] = useState(monthRange.start);
  const [toDate, setToDate] = useState(todayISO());
  const [lines, setLines] = useState<Awaited<ReturnType<typeof getPartyStatementInRange>>['lines']>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>('Select a customer to view their statement.');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          ...cardSurface(colors, isDark),
          marginBottom: spacing.md,
          padding: spacing.md,
          borderRadius: radius.md,
        },
        dateRow: { flexDirection: 'row', gap: spacing.sm },
        dateField: { flex: 1 },
        summaryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
        summaryChip: {
          flex: 1,
          minWidth: 0,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.sm,
          backgroundColor: colors.background,
        },
        summaryLabel: {
          fontSize: 10,
          color: colors.textMuted,
          textTransform: 'uppercase',
          marginBottom: 2,
        },
        summaryValue: { fontSize: 14, fontWeight: '700', color: colors.text },
        closingValue: { fontSize: 14, fontWeight: '700', color: colors.primary },
        hint: { marginBottom: spacing.md, color: colors.textSecondary, fontSize: 13 },
        sectionCard: {
          ...cardSurface(colors, isDark),
          borderRadius: radius.md,
          overflow: 'hidden',
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        sectionTitle: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        },
        sectionCount: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        stmtRow: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        stmtRowLast: { borderBottomWidth: 0 },
        stmtTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        stmtDesc: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1, marginRight: spacing.sm },
        stmtDate: { fontSize: 12, color: colors.textSecondary },
        stmtAmounts: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
          gap: spacing.sm,
        },
        stmtChip: {
          flex: 1,
          paddingVertical: 6,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.sm,
          backgroundColor: colors.background,
        },
        stmtChipLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 2 },
        stmtChipValue: { fontSize: 13, fontWeight: '600', color: colors.text },
        stmtBalChip: { backgroundColor: colors.navActive },
        stmtBalValue: { fontSize: 13, fontWeight: '700', color: colors.primary },
        emptyBox: { padding: spacing.xl, alignItems: 'center' },
        emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    void refreshKey;
    const trimmed = customerName.trim();
    if (!trimmed) {
      setCustomerParty(null);
      setLines([]);
      setOpeningBalance(0);
      setClosingBalance(0);
      setHint('Select a customer to view their statement.');
      setError(null);
      return;
    }
    if (!isValidISODate(fromDate) || !isValidISODate(toDate)) {
      setLines([]);
      setHint('Choose valid from and to dates.');
      setError(null);
      return;
    }
    if (fromDate > toDate) {
      setLines([]);
      setHint('From date must be on or before the to date.');
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setLines([]);
      setOpeningBalance(0);
      setClosingBalance(0);
      setCustomerParty(null);

      const party = await getPartyByName(trimmed, 'customer');
      if (!party) {
        setHint('No customer with this name. Create them in Parties first.');
        setError(null);
        return;
      }

      const result = await getPartyStatementInRange(party.id, fromDate, toDate);
      setCustomerParty(party);
      setLines(result.lines);
      setOpeningBalance(result.openingBalance);
      setClosingBalance(result.closingBalance);
      setHint(null);
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  }, [customerName, fromDate, toDate, refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const showStatement = customerName.trim().length > 0 && !hint && !loading;

  const exportPdf = useCallback(async () => {
    const trimmed = customerName.trim();
    if (!trimmed || hint) {
      return {
        success: false,
        message: 'Choose a customer and date range before downloading the PDF.',
      };
    }
    return sharePartyStatementPdf({
      partyType: 'customer',
      partyName: trimmed,
      partyPhone: customerParty?.phone,
      fromDate,
      toDate,
      openingBalance,
      closingBalance,
      lines,
    });
  }, [customerName, hint, customerParty, fromDate, toDate, openingBalance, closingBalance, lines]);

  useReportPdfHeader({ disabled: !showStatement || !!error, onExport: exportPdf });

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={localStyles.header}>
        <CustomerPickerField value={customerName} onChange={setCustomerName} />
        <View style={localStyles.dateRow}>
          <View style={localStyles.dateField}>
            <DatePickerField label="From" value={fromDate} onChange={setFromDate} />
          </View>
          <View style={localStyles.dateField}>
            <DatePickerField label="To" value={toDate} onChange={setToDate} />
          </View>
        </View>
        {showStatement ? (
          <>
            <View style={localStyles.summaryRow}>
              <View style={localStyles.summaryChip}>
                <Text style={localStyles.summaryLabel}>Opening</Text>
                <MoneyText amount={openingBalance} size="md" style={{ textAlign: 'left' }} />
              </View>
              <View style={localStyles.summaryChip}>
                <Text style={localStyles.summaryLabel}>Closing</Text>
                <MoneyText amount={closingBalance} size="md" color={colors.primary} style={{ textAlign: 'left' }} />
              </View>
            </View>
          </>
        ) : null}
      </View>

      {hint ? <Text style={localStyles.hint}>{hint}</Text> : null}
      {loading ? <Text style={localStyles.hint}>Loading statement…</Text> : null}

      {showStatement ? (
        <>
          <View style={localStyles.sectionHeader}>
            <Text style={localStyles.sectionTitle}>Customer Statement</Text>
            <Text style={localStyles.sectionCount}>{lines.length} entries</Text>
          </View>
          <LedgerTable
            rows={lines}
            emptyText="No transactions in this date range."
          />
        </>
      ) : null}
    </ScrollView>
  );
}

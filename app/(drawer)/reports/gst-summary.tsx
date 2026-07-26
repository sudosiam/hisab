import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getGstSummary } from '../../../src/services/gstReports';
import { MoneyText, moneyRowStyles } from '../../../src/components/MoneyText';
import { ErrorState, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useSyncedPeriodKey } from '../../../src/hooks/useSyncedPeriodKey';
import { useReportPdfHeader } from '../../../src/hooks/useReportPdfHeader';
import { shareGstr1Helper, shareGstr3bHelper } from '../../../src/services/gstReturnExport';
import { shareGstSummaryPdf } from '../../../src/services/reportPdf';
import { radius, spacing } from '../../../src/constants/theme';
import { formatSqliteError } from '../../../src/db/database';
import { cardSurface } from '../../../src/constants/shadows';

export default function GstSummaryScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const [monthKey, setMonthKey] = useSyncedPeriodKey();
  const [data, setData] = useState<Awaited<ReturnType<typeof getGstSummary>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [booting, setBooting] = useState(true);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.md,
        },
        row: { ...moneyRowStyles.row, paddingVertical: spacing.sm },
        label: { flex: 1, color: colors.text, fontSize: 14, paddingRight: spacing.sm },
        bold: { fontWeight: '700' },
        hint: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.md, lineHeight: 18 },
        actions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.md,
        },
        actionBtn: {
          flexGrow: 1,
          flexBasis: '47%',
          minWidth: 140,
          backgroundColor: colors.primaryContainer,
          paddingVertical: 10,
          minHeight: 40,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionText: { color: colors.onPrimaryContainer, fontWeight: '700', fontSize: 13 },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    void refreshKey;
    try {
      setData(await getGstSummary(monthKey));
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setBooting(false);
    }
  }, [monthKey, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const exportPdf = useCallback(async () => {
    if (!data) return { success: false, message: 'Nothing to export' };
    return shareGstSummaryPdf(monthKey, data);
  }, [monthKey, data]);

  useReportPdfHeader({ disabled: !!error || !data, onExport: exportPdf });

  const exportGstr1Helper = useCallback(async () => {
    try {
      await shareGstr1Helper(monthKey);
    } catch (e) {
      Alert.alert(
        'Export failed',
        e instanceof Error ? e.message : 'Could not export GSTR-1 helper.'
      );
    }
  }, [monthKey]);

  const exportGstr3bHelper = useCallback(async () => {
    try {
      await shareGstr3bHelper(monthKey);
    } catch (e) {
      Alert.alert(
        'Export failed',
        e instanceof Error ? e.message : 'Could not export GSTR-3B helper.'
      );
    }
  }, [monthKey]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (booting || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const Row = ({
    label,
    amount,
    bold,
  }: {
    label: string;
    amount: number;
    bold?: boolean;
  }) => (
    <View style={localStyles.row}>
      <Text style={[localStyles.label, bold && localStyles.bold]}>{label}</Text>
      <MoneyText amount={amount} size={bold ? 'md' : 'sm'} />
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
      <Text style={localStyles.hint}>
        GSTR-3B style summary for this business. Net payable = output tax − input tax credit.
        Export JSON helpers below to cross-check before filing — not for direct portal upload.
      </Text>

      <View style={localStyles.actions}>
        <TouchableOpacity
          style={localStyles.actionBtn}
          onPress={() => void exportGstr1Helper()}
          accessibilityRole="button"
          accessibilityLabel="Export GSTR-1 helper JSON"
        >
          <Text style={localStyles.actionText}>Export GSTR-1 helper (JSON)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={localStyles.actionBtn}
          onPress={() => void exportGstr3bHelper()}
          accessibilityRole="button"
          accessibilityLabel="Export GSTR-3B helper JSON"
        >
          <Text style={localStyles.actionText}>Export GSTR-3B helper (JSON)</Text>
        </TouchableOpacity>
      </View>

      <SectionHeader title="Outward supplies" />
      <View style={localStyles.section}>
        <Row label="Taxable value" amount={data.outwardTaxable} />
        <Row label="CGST" amount={data.outwardCgst} />
        <Row label="SGST" amount={data.outwardSgst} />
        <Row label="IGST" amount={data.outwardIgst} />
        <Row label="Output tax" amount={data.outwardTax} bold />
      </View>

      <SectionHeader title="Inward supplies (ITC)" />
      <View style={localStyles.section}>
        <Row label="Taxable value" amount={data.inwardTaxable} />
        <Row label="Input CGST" amount={data.inwardCgst} />
        <Row label="Input SGST" amount={data.inwardSgst} />
        <Row label="Input IGST" amount={data.inwardIgst} />
        <Row label="Input tax" amount={data.inwardTax} bold />
      </View>

      <SectionHeader title="Net GST" />
      <View style={localStyles.section}>
        <Row label="Net payable / (credit)" amount={data.netPayable} bold />
      </View>
    </ScrollView>
  );
}

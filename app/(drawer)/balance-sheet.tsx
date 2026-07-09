import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ErrorState, SectionHeader, useScreenStyles } from '../../src/components/ui';
import { getBalanceSheet } from '../../src/services/banking';
import { formatCurrency } from '../../src/utils/format';
import { MoneyText, moneyRowStyles } from '../../src/components/MoneyText';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useReportPdfHeader } from '../../src/hooks/useReportPdfHeader';
import { shareBalanceSheetPdf } from '../../src/services/reportPdf';
import { spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { BalanceSheet } from '../../src/types';

export default function BalanceSheetScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors, isDark } = useTheme();
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...cardSurface(colors, isDark),
          padding: spacing.lg,
          marginBottom: spacing.lg,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textSecondary, textTransform: 'uppercase' },
        heroValue: { ...typography.display, color: colors.text, marginTop: spacing.sm },
        section: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        sectionTotal: {
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
        },
        equity: { backgroundColor: colors.navActive },
        info: {
          backgroundColor: colors.navActive,
          borderRadius: 16,
          padding: spacing.md,
          marginBottom: spacing.lg,
          borderWidth: isDark ? 1 : 0,
          borderColor: colors.border,
        },
        infoText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
        row: { ...moneyRowStyles.row, paddingVertical: spacing.sm },
        rowLabel: { fontSize: 14, color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        rowValue: { maxWidth: '52%' },
        bold: { fontWeight: '700' },
        highlight: { color: colors.text, fontSize: 17, fontWeight: '600' },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    void refreshKey;
    setLoading(true);
    try {
      setData(await getBalanceSheet());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load balance sheet');
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportPdf = useCallback(async () => {
    if (!data) return { success: false, message: 'Report not loaded yet.' };
    return shareBalanceSheetPdf(data);
  }, [data]);

  useReportPdfHeader({ disabled: !data || !!error, onExport: exportPdf });

  if (error && !data) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (loading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const rowStyles = {
    row: localStyles.row as ViewStyle,
    rowLabel: localStyles.rowLabel as TextStyle,
    rowValue: localStyles.rowValue as TextStyle,
    bold: localStyles.bold as TextStyle,
    highlight: localStyles.highlight as TextStyle,
  };

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
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={localStyles.hero}>
        <Text style={localStyles.heroLabel}>Owner{"'"}s Equity</Text>
        <MoneyText amount={data.equity} size="hero" style={localStyles.heroValue} />
        <Text
          style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: 12, textAlign: 'center' }}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          Assets {formatCurrency(data.assets.total)} − Liabilities {formatCurrency(data.liabilities.total)}
        </Text>
      </View>

      <View style={localStyles.info}>
        <Text style={localStyles.infoText}>
          As of today. Deactivated accounts are excluded from cash/bank totals; inventory uses current stock value, and loans appear under liabilities.
        </Text>
      </View>

      <SectionHeader title="Assets" />
      <View style={localStyles.section}>
        <Row localStyles={rowStyles} label="Cash & Bank" value={data.assets.cashAndBank} />
        <Row localStyles={rowStyles} label="Accounts Receivable" value={data.assets.receivables} />
        <Row localStyles={rowStyles} label="Inventory" value={data.assets.inventory} />
        <Row localStyles={rowStyles} label="Fixed Assets" value={data.assets.fixedAssets} />
        <View style={localStyles.sectionTotal}>
          <Row localStyles={rowStyles} label="Total Assets" value={data.assets.total} bold />
        </View>
      </View>

      <SectionHeader title="Liabilities" />
      <View style={localStyles.section}>
        <Row localStyles={rowStyles} label="Accounts Payable" value={data.liabilities.payables} />
        <Row localStyles={rowStyles} label="Loans" value={data.liabilities.loans} />
        <View style={localStyles.sectionTotal}>
          <Row localStyles={rowStyles} label="Total Liabilities" value={data.liabilities.total} bold />
        </View>
      </View>

      <SectionHeader title="Summary" />
      <View style={[localStyles.section, localStyles.equity]}>
        <Row localStyles={rowStyles} label="Net Worth (Equity)" value={data.equity} bold highlight />
      </View>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
  localStyles,
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: boolean;
  localStyles: {
    row: ViewStyle;
    rowLabel: TextStyle;
    rowValue: TextStyle;
    bold: TextStyle;
    highlight: TextStyle;
  };
}) {
  return (
    <View style={localStyles.row}>
      <Text style={[localStyles.rowLabel, bold && localStyles.bold]} numberOfLines={2}>
        {label}
      </Text>
      <MoneyText
        amount={value}
        size={highlight || bold ? 'lg' : 'md'}
        style={[localStyles.rowValue, bold && localStyles.bold, highlight && localStyles.highlight]}
      />
    </View>
  );
}

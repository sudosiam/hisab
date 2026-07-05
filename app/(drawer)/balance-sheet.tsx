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
import { useTheme } from '../../src/context/ThemeContext';
import { spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { BalanceSheet } from '../../src/types';

export default function BalanceSheetScreen() {
  const styles = useScreenStyles();
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
        heroLabel: { ...typography.section, color: colors.textMuted, textTransform: 'uppercase' },
        heroValue: { ...typography.display, color: colors.primary, marginTop: spacing.sm },
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
        row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
        rowLabel: { fontSize: 14, color: colors.text },
        rowValue: { fontSize: 14, color: colors.text, fontWeight: '500' },
        bold: { fontWeight: '700' },
        highlight: { color: colors.primary, fontSize: 17, fontWeight: '700' },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getBalanceSheet());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load balance sheet');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        <Text style={localStyles.heroLabel}>Owner&apos;s Equity</Text>
        <Text style={localStyles.heroValue}>{formatCurrency(data.equity)}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13 }}>
          Assets {formatCurrency(data.assets.total)} − Liabilities {formatCurrency(data.liabilities.total)}
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
      <Text style={[localStyles.rowLabel, bold && localStyles.bold]}>{label}</Text>
      <Text style={[localStyles.rowValue, bold && localStyles.bold, highlight && localStyles.highlight]}>
        {formatCurrency(value)}
      </Text>
    </View>
  );
}

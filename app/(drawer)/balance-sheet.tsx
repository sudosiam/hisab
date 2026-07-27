import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { ErrorState, SectionHeader, SummaryHero, useScreenStyles } from '../../src/components/ui';
import { getBalanceSheet } from '../../src/services/banking';
import { formatCurrency } from '../../src/utils/format';
import { MoneyText, moneyRowStyles } from '../../src/components/MoneyText';
import { DetailSkeleton } from '../../src/components/Skeleton';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useReportPdfHeader } from '../../src/hooks/useReportPdfHeader';
import { shareBalanceSheetPdf } from '../../src/services/reportPdf';
import { spacing } from '../../src/constants/theme';
import { alertRefreshFailed } from '../../src/utils/uiFeedback';
import type { BalanceSheet, BalanceSheetLine } from '../../src/types';

export default function BalanceSheetScreen() {
  const styles = useScreenStyles();
  const { refreshKey } = useDatabase();
  const { colors } = useTheme();
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        subsection: {
          fontSize: 11,
          fontWeight: '700',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginTop: spacing.sm,
          marginBottom: spacing.xs,
        },
        subsectionFirst: { marginTop: 0 },
        sectionTotal: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.borderLight,
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
        },
        row: { ...moneyRowStyles.row, paddingVertical: spacing.sm },
        rowLabel: { fontSize: 14, color: colors.text, flex: 1, minWidth: 0, paddingRight: spacing.sm },
        rowValue: { maxWidth: '62%', flexShrink: 1, minWidth: 88, width: '100%', textAlign: 'right' },
        bold: { fontWeight: '700' },
        highlight: { color: colors.text, fontSize: 17, fontWeight: '600' },
        hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderLight },
      }),
    [colors]
  );

  const load = useCallback(async () => {
    setData(await getBalanceSheet());
  }, []);

  const { booting, error, retry } = useFocusRefresh(load, [refreshKey]);

  const exportPdf = useCallback(async () => {
    if (!data) return { success: false, message: 'Report not loaded yet.' };
    return shareBalanceSheetPdf(data);
  }, [data]);

  useReportPdfHeader({ disabled: !data || !!error, onExport: exportPdf });

  if (error && !data) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (booting && !data) {
    return <DetailSkeleton />;
  }

  if (!data) {
    return <DetailSkeleton />;
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
            load()
              .catch((e) => alertRefreshFailed(e))
              .finally(() => setRefreshing(false));
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <SummaryHero
        label={"Owner's Equity"}
        amount={data.equity}
        hint={`Assets ${formatCurrency(data.assets.total)} − Liabilities ${formatCurrency(data.liabilities.total)}`}
      />

      <SectionHeader title="Assets" />
      <Text style={[localStyles.subsection, localStyles.subsectionFirst]}>Current assets</Text>
      <LineRows lines={data.assets.currentAssets} localStyles={rowStyles} />
      <View style={localStyles.sectionTotal}>
        <Row
          localStyles={rowStyles}
          label="Total Current Assets"
          value={data.assets.currentAssets.reduce((sum, line) => sum + line.amount, 0)}
          bold
        />
      </View>
      <Text style={localStyles.subsection}>Non-current assets</Text>
      <LineRows lines={data.assets.nonCurrentAssets} localStyles={rowStyles} />
      <View style={localStyles.sectionTotal}>
        <Row localStyles={rowStyles} label="Total Assets" value={data.assets.total} bold />
      </View>

      <SectionHeader title="Liabilities" />
      <Text style={[localStyles.subsection, localStyles.subsectionFirst]}>Current liabilities</Text>
      <LineRows lines={data.liabilities.currentLiabilities} localStyles={rowStyles} />
      <Text style={localStyles.subsection}>Non-current liabilities</Text>
      <LineRows lines={data.liabilities.nonCurrentLiabilities} localStyles={rowStyles} />
      <View style={localStyles.sectionTotal}>
        <Row localStyles={rowStyles} label="Total Liabilities" value={data.liabilities.total} bold />
      </View>

      <SectionHeader title="Summary" />
      <View style={localStyles.hairline} />
      <Row localStyles={rowStyles} label="Net Worth (Equity)" value={data.equity} bold highlight />
    </ScrollView>
  );
}

function LineRows({
  lines,
  localStyles,
}: {
  lines: BalanceSheetLine[];
  localStyles: {
    row: ViewStyle;
    rowLabel: TextStyle;
    rowValue: TextStyle;
    bold: TextStyle;
    highlight: TextStyle;
  };
}) {
  if (lines.length === 0) {
    return <Row localStyles={localStyles} label="None" value={0} />;
  }
  return (
    <>
      {lines.map((line) => (
        <Row key={line.key} localStyles={localStyles} label={line.label} value={line.amount} />
      ))}
    </>
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

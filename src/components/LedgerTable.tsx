import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatDisplayDate } from '../utils/date';
import { spacing } from '../constants/theme';
import { MoneyText } from './MoneyText';
import type { PartyStatementLine } from '../types';

export type LedgerRow = Pick<
  PartyStatementLine,
  'id' | 'date' | 'description' | 'debit' | 'credit' | 'balance'
>;

interface Props {
  rows: LedgerRow[];
  showBalance?: boolean;
  showDate?: boolean;
  emptyText?: string;
  onRowLongPress?: (row: LedgerRow) => void;
  onRowPress?: (row: LedgerRow) => void;
  /** Accessibility hint when a row is pressable (e.g. "Long-press to delete"). */
  rowActionHint?: string;
  footerRows?: { label: string; debit: number; credit: number; balance?: number }[];
}

function AmountCell({
  amount,
  style,
  bold,
}: {
  amount: number;
  style?: StyleProp<TextStyle>;
  bold?: boolean;
}) {
  if (amount <= 0.009) {
    return (
      <Text style={[style, bold && staticStyles.boldCell]} numberOfLines={1}>
        —
      </Text>
    );
  }
  return (
    <MoneyText
      amount={amount}
      size="sm"
      style={[style, bold && staticStyles.boldCell]}
      lines={1}
      minimumFontScale={0.5}
    />
  );
}

export function LedgerTable({
  rows,
  showBalance = true,
  showDate = true,
  emptyText = 'No entries.',
  onRowLongPress,
  onRowPress,
  rowActionHint,
  footerRows,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (rows.length === 0 && !footerRows?.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const renderAmountCells = (debit: number, credit: number, balance?: number, bold?: boolean) => (
    <>
      <View style={styles.amtCol}>
        <AmountCell amount={debit} style={styles.debit} bold={bold} />
      </View>
      <View style={styles.amtCol}>
        <AmountCell amount={credit} style={styles.credit} bold={bold} />
      </View>
      {showBalance ? (
        <View style={styles.amtCol}>
          {balance != null ? (
            <MoneyText
              amount={balance}
              size="sm"
              style={[styles.balance, bold && staticStyles.boldCell]}
              lines={1}
              minimumFontScale={0.5}
            />
          ) : (
            <Text style={[styles.balance, bold && staticStyles.boldCell]}>—</Text>
          )}
        </View>
      ) : null}
    </>
  );

  const renderRow = (row: LedgerRow, isLast: boolean, key: string) => {
    const content = (
      <View style={styles.line}>
        {showDate ? (
          <Text style={styles.dateText} numberOfLines={1}>
            {formatDisplayDate(row.date)}
          </Text>
        ) : null}
        <Text style={styles.descText} numberOfLines={1}>
          {row.description}
        </Text>
        {renderAmountCells(row.debit, row.credit, row.balance)}
      </View>
    );

    if (onRowLongPress || onRowPress) {
      const actionHint = rowActionHint ?? (onRowLongPress ? 'Long-press for actions' : 'Tap for actions');
      return (
        <TouchableOpacity
          key={key}
          style={[styles.dataRow, isLast && styles.dataRowLast]}
          onPress={onRowPress ? () => onRowPress(row) : undefined}
          onLongPress={onRowLongPress ? () => onRowLongPress(row) : undefined}
          delayLongPress={400}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${row.description}. ${actionHint}`}
          accessibilityHint={actionHint}
        >
          {content}
        </TouchableOpacity>
      );
    }

    return (
      <View key={key} style={[styles.dataRow, isLast && styles.dataRowLast]}>
        {content}
      </View>
    );
  };

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        {showDate ? <Text style={[styles.headerCell, styles.dateHeader]}>Date</Text> : null}
        <Text style={[styles.headerCell, styles.particularsHeader]}>Particulars</Text>
        <Text style={[styles.headerCell, styles.amtHeader]}>Dr</Text>
        <Text style={[styles.headerCell, styles.amtHeader]}>Cr</Text>
        {showBalance ? <Text style={[styles.headerCell, styles.amtHeader]}>Bal</Text> : null}
      </View>
      {rows.map((row, index) =>
        renderRow(row, index === rows.length - 1 && !footerRows?.length, String(row.id))
      )}
      {footerRows?.map((row, index) => (
        <View
          key={`footer-${row.label}`}
          style={[
            styles.dataRow,
            styles.footerRow,
            index === footerRows.length - 1 && styles.dataRowLast,
          ]}
        >
          <View style={styles.line}>
            {showDate ? <View style={styles.dateSpacer} /> : null}
            <Text style={[styles.descText, styles.footerLabel]} numberOfLines={1}>
              {row.label}
            </Text>
            {renderAmountCells(row.debit, row.credit, row.balance, true)}
          </View>
        </View>
      ))}
    </View>
  );
}

const staticStyles = StyleSheet.create({
  boldCell: { fontWeight: '600' },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    table: {
      width: '100%',
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surfaceContainer,
      gap: 4,
    },
    headerCell: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    dateHeader: { width: 64, flexShrink: 0 },
    particularsHeader: { flex: 1, minWidth: 0 },
    amtHeader: { width: 68, textAlign: 'right', flexShrink: 0 },
    dataRow: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      minHeight: 32,
      justifyContent: 'center',
    },
    dataRowLast: { borderBottomWidth: 0 },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    dateText: {
      width: 64,
      fontSize: 11,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
      flexShrink: 0,
    },
    dateSpacer: { width: 64, flexShrink: 0 },
    descText: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: colors.text,
    },
    amtCol: {
      width: 68,
      flexShrink: 0,
      alignItems: 'flex-end',
    },
    debit: { color: colors.text, fontWeight: '500', textAlign: 'right' },
    credit: { color: colors.textSecondary, fontWeight: '500', textAlign: 'right' },
    balance: { color: colors.text, fontWeight: '600', textAlign: 'right' },
    footerRow: { backgroundColor: colors.surfaceContainer },
    footerLabel: { fontWeight: '600', color: colors.text },
    emptyBox: { padding: spacing.lg, alignItems: 'center' },
    emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  });
}

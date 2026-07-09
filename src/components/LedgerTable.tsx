import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, type StyleProp, type TextStyle } from 'react-native';
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
      <Text style={[style, bold && styles.boldCell]} numberOfLines={1}>
        —
      </Text>
    );
  }
  return (
    <MoneyText
      amount={amount}
      size="sm"
      style={[style, bold && styles.boldCell]}
      minimumFontScale={0.55}
    />
  );
}

function tableMinWidth(showDate: boolean, showBalance: boolean): number {
  const date = showDate ? 76 : 0;
  const amounts = showBalance ? 3 : 2;
  return date + 140 + amounts * 92;
}

export function LedgerTable({
  rows,
  showBalance = true,
  showDate = true,
  emptyText = 'No entries.',
  onRowLongPress,
  onRowPress,
  footerRows,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const minWidth = tableMinWidth(showDate, showBalance);

  if (rows.length === 0 && !footerRows?.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const renderRow = (
    row: LedgerRow,
    isLast: boolean,
    key: string
  ) => {
    const content = (
      <>
        {showDate ? (
          <Text style={[styles.cell, styles.dateCol]} numberOfLines={1}>
            {formatDisplayDate(row.date)}
          </Text>
        ) : null}
        <Text style={[styles.cell, styles.descCol]} numberOfLines={2}>
          {row.description}
        </Text>
        <View style={styles.amtCol}>
          <AmountCell amount={row.debit} style={styles.debit} />
        </View>
        <View style={styles.amtCol}>
          <AmountCell amount={row.credit} style={styles.credit} />
        </View>
        {showBalance ? (
          <View style={styles.amtCol}>
            <MoneyText amount={row.balance} size="sm" style={styles.balance} minimumFontScale={0.55} />
          </View>
        ) : null}
      </>
    );

    if (onRowLongPress || onRowPress) {
      return (
        <TouchableOpacity
          key={key}
          style={[styles.dataRow, isLast && styles.dataRowLast]}
          onPress={onRowPress ? () => onRowPress(row) : undefined}
          onLongPress={onRowLongPress ? () => onRowLongPress(row) : undefined}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${row.description}, tap to delete`}
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
      <View style={[styles.table, { minWidth }]}>
        <View style={styles.headerRow}>
          {showDate ? <Text style={[styles.headerCell, styles.dateCol]}>Date</Text> : null}
          <Text style={[styles.headerCell, styles.descCol]}>Particulars</Text>
          <Text style={[styles.headerCell, styles.amtCol, styles.amtHeader]}>Debit</Text>
          <Text style={[styles.headerCell, styles.amtCol, styles.amtHeader]}>Credit</Text>
          {showBalance ? (
            <Text style={[styles.headerCell, styles.amtCol, styles.amtHeader]}>Balance</Text>
          ) : null}
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
            {!showDate ? null : <Text style={[styles.cell, styles.dateCol]} />}
            <Text style={[styles.cell, styles.descCol, styles.footerLabel]} numberOfLines={2}>
              {row.label}
            </Text>
            <View style={styles.amtCol}>
              <AmountCell amount={row.debit} style={styles.footerLabel} bold />
            </View>
            <View style={styles.amtCol}>
              <AmountCell amount={row.credit} style={styles.footerLabel} bold />
            </View>
            {showBalance ? (
              <View style={styles.amtCol}>
                {row.balance != null ? (
                  <MoneyText
                    amount={row.balance}
                    size="sm"
                    style={styles.footerLabel}
                    minimumFontScale={0.55}
                  />
                ) : (
                  <Text style={styles.footerLabel}>—</Text>
                )}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boldCell: { fontWeight: '600' },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    table: {
      flexGrow: 1,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      gap: 6,
    },
    headerCell: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    dataRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      gap: 6,
    },
    dataRowLast: { borderBottomWidth: 0 },
    cell: {
      fontSize: 12,
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    dateCol: { width: 76, flexShrink: 0 },
    descCol: { width: 140, flexShrink: 0, fontVariant: undefined, lineHeight: 16 },
    amtCol: { width: 92, flexShrink: 0, alignItems: 'flex-end' },
    amtHeader: { textAlign: 'right' },
    debit: { color: colors.text, fontWeight: '500', textAlign: 'right' },
    credit: { color: colors.textSecondary, fontWeight: '500', textAlign: 'right' },
    balance: { color: colors.text, fontWeight: '600', textAlign: 'right' },
    footerRow: { backgroundColor: colors.background },
    footerLabel: { fontWeight: '600', color: colors.text, textAlign: 'right' },
    emptyBox: { padding: spacing.xl, alignItems: 'center' },
    emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  });
}

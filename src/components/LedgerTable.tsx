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

function AmountHeaders({
  showBalance,
  styles: s,
}: {
  showBalance: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={s.amountRow}>
      <Text style={[s.headerCell, s.amtHeader, s.amtCol]}>Dr</Text>
      <Text style={[s.headerCell, s.amtHeader, s.amtCol]}>Cr</Text>
      {showBalance ? (
        <Text style={[s.headerCell, s.amtHeader, s.amtCol]}>Bal</Text>
      ) : null}
    </View>
  );
}

function AmountValues({
  debit,
  credit,
  balance,
  showBalance,
  bold,
  styles: s,
}: {
  debit: number;
  credit: number;
  balance?: number;
  showBalance: boolean;
  bold?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={s.amountRow}>
      <View style={s.amtCol}>
        <AmountCell amount={debit} style={s.debit} bold={bold} />
      </View>
      <View style={s.amtCol}>
        <AmountCell amount={credit} style={s.credit} bold={bold} />
      </View>
      {showBalance ? (
        <View style={s.amtCol}>
          {balance != null ? (
            <MoneyText
              amount={balance}
              size="sm"
              style={[s.balance, bold && styles.boldCell]}
              minimumFontScale={0.55}
            />
          ) : (
            <Text style={[s.balance, bold && styles.boldCell]}>—</Text>
          )}
        </View>
      ) : null}
    </View>
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

  const renderRow = (row: LedgerRow, isLast: boolean, key: string) => {
    const content = (
      <>
        <View style={styles.line1}>
          {showDate ? (
            <Text style={styles.dateText} numberOfLines={1}>
              {formatDisplayDate(row.date)}
            </Text>
          ) : null}
          <Text style={styles.descText} numberOfLines={3}>
            {row.description}
          </Text>
        </View>
        <AmountValues
          debit={row.debit}
          credit={row.credit}
          balance={row.balance}
          showBalance={showBalance}
          styles={styles}
        />
      </>
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
        <Text style={[styles.headerCell, styles.particularsHeader]}>
          {showDate ? 'Date / Particulars' : 'Particulars'}
        </Text>
        <AmountHeaders showBalance={showBalance} styles={styles} />
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
          <View style={styles.line1}>
            <Text style={[styles.descText, styles.footerLabel]} numberOfLines={2}>
              {row.label}
            </Text>
          </View>
          <AmountValues
            debit={row.debit}
            credit={row.credit}
            balance={row.balance}
            showBalance={showBalance}
            bold
            styles={styles}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  boldCell: { fontWeight: '600' },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    table: {
      width: '100%',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    headerRow: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surfaceContainer,
      gap: 4,
    },
    headerCell: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    particularsHeader: { marginBottom: 2 },
    dataRow: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      gap: 4,
      minHeight: 48,
      justifyContent: 'center',
    },
    dataRowLast: { borderBottomWidth: 0 },
    line1: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: 6,
    },
    dateText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
      flexShrink: 0,
    },
    descText: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: '60%',
      fontSize: 13,
      color: colors.text,
      lineHeight: 17,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    amtCol: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-end',
    },
    amtHeader: { textAlign: 'right', width: '100%' },
    debit: { color: colors.text, fontWeight: '500', textAlign: 'right' },
    credit: { color: colors.textSecondary, fontWeight: '500', textAlign: 'right' },
    balance: { color: colors.text, fontWeight: '600', textAlign: 'right' },
    footerRow: { backgroundColor: colors.surfaceContainer },
    footerLabel: { fontWeight: '600', color: colors.text },
    emptyBox: { padding: spacing.lg, alignItems: 'center' },
    emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  });
}

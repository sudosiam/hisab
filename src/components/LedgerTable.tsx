import React, { useCallback, useMemo, type ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  type RefreshControlProps,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatDisplayDate } from '../utils/date';
import { spacing, typography } from '../constants/theme';
import { FLATLIST_PERF } from '../constants/listPerf';
import { MoneyText } from './MoneyText';
import type { PartyStatementLine } from '../types';

const ROW_ACTIVE_OPACITY = 0.75;

export type LedgerRow = Pick<
  PartyStatementLine,
  'id' | 'date' | 'description' | 'debit' | 'credit' | 'balance'
> &
  Partial<Pick<PartyStatementLine, 'reference_type' | 'reference_id'>>;

/** Compact ledger row height for getItemLayout (padding + line). */
export const LEDGER_ROW_HEIGHT = 36;

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
  /** Content above the column header (filters, totals). Ledger owns scroll when set with style flex. */
  ListHeaderComponent?: ReactElement | null;
  /** Extra content below footer totals. */
  ListFooterComponent?: ReactElement | null;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * When false, list expands to fit all rows (nest inside another ScrollView).
   * Prefer owning scroll via ListHeaderComponent instead for large datasets.
   */
  scrollEnabled?: boolean;
  keyboardShouldPersistTaps?: 'always' | 'handled' | 'never';
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
  if (amount <= 0) {
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
  ListHeaderComponent,
  ListFooterComponent,
  refreshControl,
  style,
  contentContainerStyle,
  scrollEnabled = true,
  keyboardShouldPersistTaps = 'handled',
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderAmountCells = useCallback(
    (debit: number, credit: number, balance?: number, bold?: boolean) => (
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
    ),
    [showBalance, styles]
  );

  const columnHeader = useMemo(
    () => (
      <View style={styles.headerRow}>
        {showDate ? <Text style={[styles.headerCell, styles.dateHeader]}>Date</Text> : null}
        <Text style={[styles.headerCell, styles.particularsHeader]}>Particulars</Text>
        <Text style={[styles.headerCell, styles.amtHeader]}>Dr</Text>
        <Text style={[styles.headerCell, styles.amtHeader]}>Cr</Text>
        {showBalance ? <Text style={[styles.headerCell, styles.amtHeader]}>Bal</Text> : null}
      </View>
    ),
    [showDate, showBalance, styles]
  );

  const listHeader = useMemo(
    () => (
      <View>
        {ListHeaderComponent}
        {rows.length > 0 || (footerRows?.length ?? 0) > 0 ? (
          <View style={styles.tableChrome}>{columnHeader}</View>
        ) : null}
      </View>
    ),
    [ListHeaderComponent, rows.length, footerRows?.length, columnHeader, styles.tableChrome]
  );

  const listFooter = useMemo(() => {
    if (!footerRows?.length && !ListFooterComponent) return null;
    return (
      <View>
        {footerRows?.map((row, index) => (
          <View
            key={`footer-${row.label}`}
            style={[
              styles.dataRow,
              styles.footerRow,
              index === footerRows.length - 1 && !ListFooterComponent && styles.dataRowLast,
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
        {ListFooterComponent}
      </View>
    );
  }, [footerRows, ListFooterComponent, showDate, styles, renderAmountCells]);

  const keyExtractor = useCallback((item: LedgerRow) => String(item.id), []);

  const getItemLayout = useCallback(
    (_: ArrayLike<LedgerRow> | null | undefined, index: number) => ({
      length: LEDGER_ROW_HEIGHT,
      offset: LEDGER_ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LedgerRow; index: number }) => {
      const isLast = index === rows.length - 1 && !footerRows?.length;
      const content = (
        <View style={styles.line}>
          {showDate ? (
            <Text style={styles.dateText} numberOfLines={1}>
              {formatDisplayDate(item.date)}
            </Text>
          ) : null}
          <Text style={styles.descText} numberOfLines={1}>
            {item.description}
          </Text>
          {renderAmountCells(item.debit, item.credit, item.balance)}
        </View>
      );

      if (onRowLongPress || onRowPress) {
        const actionHint =
          rowActionHint ?? (onRowLongPress ? 'Long-press for actions' : 'Tap for actions');
        return (
          <TouchableOpacity
            style={[styles.dataRow, isLast && styles.dataRowLast]}
            onPress={onRowPress ? () => onRowPress(item) : undefined}
            onLongPress={onRowLongPress ? () => onRowLongPress(item) : undefined}
            delayLongPress={400}
            activeOpacity={ROW_ACTIVE_OPACITY}
            accessibilityRole="button"
            accessibilityLabel={`${item.description}. ${actionHint}`}
            accessibilityHint={actionHint}
          >
            {content}
          </TouchableOpacity>
        );
      }

      return <View style={[styles.dataRow, isLast && styles.dataRowLast]}>{content}</View>;
    },
    [
      rows.length,
      footerRows?.length,
      showDate,
      styles,
      renderAmountCells,
      onRowLongPress,
      onRowPress,
      rowActionHint,
    ]
  );

  const empty = useMemo(
    () =>
      rows.length === 0 && !footerRows?.length ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : null,
    [rows.length, footerRows?.length, emptyText, styles]
  );

  // Embedded in a parent ScrollView — never mount FlatList (VirtualizedList warning).
  if (!scrollEnabled) {
    return (
      <View style={[styles.listEmbedded, style]}>
        {listHeader}
        {rows.length === 0
          ? empty
          : rows.map((item, index) => (
              <React.Fragment key={keyExtractor(item)}>
                {renderItem({ item, index })}
              </React.Fragment>
            ))}
        {listFooter}
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.list, style]}
      contentContainerStyle={[styles.listContent, contentContainerStyle]}
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={empty}
      refreshControl={refreshControl}
      scrollEnabled
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...FLATLIST_PERF}
    />
  );
}

const staticStyles = StyleSheet.create({
  boldCell: { fontWeight: '600' },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    list: {
      flex: 1,
      width: '100%',
    },
    listEmbedded: {
      width: '100%',
      flexGrow: 0,
    },
    listContent: {
      flexGrow: 1,
    },
    tableChrome: {
      width: '100%',
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
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
      minHeight: 28,
    },
    headerCell: {
      ...typography.micro,
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
      minHeight: LEDGER_ROW_HEIGHT,
      height: LEDGER_ROW_HEIGHT,
      justifyContent: 'center',
      backgroundColor: colors.surface,
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
    footerRow: { backgroundColor: colors.surfaceContainer, height: undefined, minHeight: LEDGER_ROW_HEIGHT },
    footerLabel: { fontWeight: '600', color: colors.text },
    emptyBox: { padding: spacing.lg, alignItems: 'center' },
    emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  });
}

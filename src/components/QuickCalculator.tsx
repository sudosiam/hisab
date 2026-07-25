import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { elevatedSurface } from '../constants/shadows';

const HISTORY_KEY = '@hisab/calc_history';
const MAX_HISTORY = 20;

type HistoryEntry = { expression: string; result: string; at: number };

function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded);
}

function applyOp(left: number, op: string, right: number): number {
  switch (op) {
    case '+':
      return left + right;
    case '−':
    case '-':
      return left - right;
    case '×':
    case '*':
      return left * right;
    case '÷':
    case '/':
      return right === 0 ? NaN : left / right;
    default:
      return right;
  }
}

export function CalculatorHeaderButton({ tintColor }: { tintColor: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ marginRight: Platform.OS === 'ios' ? 4 : 8, padding: 8 }}
        hitSlop={8}
        android_ripple={{ borderless: true, radius: 20 }}
        accessibilityRole="button"
        accessibilityLabel="Open calculator"
      >
        <Ionicons name="calculator-outline" size={22} color={tintColor} />
      </Pressable>
      <QuickCalculator visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function QuickCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [display, setDisplay] = useState('0');
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const [expression, setExpression] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as HistoryEntry[];
          if (Array.isArray(parsed)) setHistory(parsed.slice(0, MAX_HISTORY));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [visible]);

  const persistHistory = useCallback(async (next: HistoryEntry[]) => {
    setHistory(next);
    try {
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const pushHistory = useCallback(
    (expr: string, result: string) => {
      const entry: HistoryEntry = { expression: expr, result, at: Date.now() };
      void persistHistory([entry, ...history].slice(0, MAX_HISTORY));
    },
    [history, persistHistory]
  );

  const inputDigit = (digit: string) => {
    setDisplay((prev) => {
      if (fresh || prev === '0' || prev === 'Error') {
        setFresh(false);
        return digit === '.' ? '0.' : digit;
      }
      if (digit === '.' && prev.includes('.')) return prev;
      return prev + digit;
    });
  };

  const clearAll = () => {
    setDisplay('0');
    setAccumulator(null);
    setPendingOp(null);
    setFresh(true);
    setExpression('');
  };

  const backspace = () => {
    if (fresh) return;
    setDisplay((prev) => {
      if (prev.length <= 1 || prev === 'Error') {
        setFresh(true);
        return '0';
      }
      return prev.slice(0, -1);
    });
  };

  const percent = () => {
    const n = parseFloat(display);
    if (!Number.isFinite(n)) return;
    setDisplay(formatResult(n / 100));
    setFresh(true);
  };

  const chooseOp = (op: string) => {
    const current = parseFloat(display);
    if (!Number.isFinite(current)) return;
    if (accumulator !== null && pendingOp && !fresh) {
      const result = applyOp(accumulator, pendingOp, current);
      const formatted = formatResult(result);
      setDisplay(formatted);
      setAccumulator(Number.isFinite(result) ? result : null);
      setExpression(`${accumulator} ${pendingOp} ${current}`);
    } else {
      setAccumulator(current);
      setExpression(`${current}`);
    }
    setPendingOp(op);
    setFresh(true);
  };

  const equals = () => {
    const current = parseFloat(display);
    if (!Number.isFinite(current) || accumulator === null || !pendingOp) return;
    const result = applyOp(accumulator, pendingOp, current);
    const formatted = formatResult(result);
    const expr = `${accumulator} ${pendingOp} ${current}`;
    setDisplay(formatted);
    pushHistory(expr, formatted);
    setExpression(expr);
    setAccumulator(null);
    setPendingOp(null);
    setFresh(true);
  };

  const reuseHistory = (entry: HistoryEntry) => {
    setDisplay(entry.result);
    setAccumulator(null);
    setPendingOp(null);
    setExpression(entry.expression);
    setFresh(true);
  };

  const keys: { label: string; onPress: () => void; tone?: 'op' | 'eq' | 'muted' }[][] = [
    [
      { label: 'C', onPress: clearAll, tone: 'muted' },
      { label: '⌫', onPress: backspace, tone: 'muted' },
      { label: '%', onPress: percent, tone: 'op' },
      { label: '÷', onPress: () => chooseOp('÷'), tone: 'op' },
    ],
    [
      { label: '7', onPress: () => inputDigit('7') },
      { label: '8', onPress: () => inputDigit('8') },
      { label: '9', onPress: () => inputDigit('9') },
      { label: '×', onPress: () => chooseOp('×'), tone: 'op' },
    ],
    [
      { label: '4', onPress: () => inputDigit('4') },
      { label: '5', onPress: () => inputDigit('5') },
      { label: '6', onPress: () => inputDigit('6') },
      { label: '−', onPress: () => chooseOp('−'), tone: 'op' },
    ],
    [
      { label: '1', onPress: () => inputDigit('1') },
      { label: '2', onPress: () => inputDigit('2') },
      { label: '3', onPress: () => inputDigit('3') },
      { label: '+', onPress: () => chooseOp('+'), tone: 'op' },
    ],
    [
      { label: '0', onPress: () => inputDigit('0') },
      { label: '.', onPress: () => inputDigit('.') },
      { label: '=', onPress: equals, tone: 'eq' },
    ],
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Calculator</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {history.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.historyScroll}
              contentContainerStyle={styles.historyContent}
            >
              {history.map((entry) => (
                <TouchableOpacity
                  key={`${entry.at}-${entry.expression}`}
                  style={styles.historyChip}
                  onPress={() => reuseHistory(entry)}
                >
                  <Text style={styles.historyExpr} numberOfLines={1}>
                    {entry.expression}
                  </Text>
                  <Text style={styles.historyResult} numberOfLines={1}>
                    = {entry.result}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <Text style={styles.expression} numberOfLines={1}>
            {expression}
            {pendingOp ? ` ${pendingOp}` : ''}
          </Text>
          <Text style={styles.display} numberOfLines={1}>
            {display}
          </Text>

          <View style={styles.pad}>
            {keys.map((row, ri) => (
              <View key={ri} style={styles.row}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key.label}
                    style={[
                      styles.key,
                      key.label === '0' && styles.keyWide,
                      key.label === '=' && styles.keyWide,
                      key.tone === 'op' && styles.keyOp,
                      key.tone === 'eq' && styles.keyEq,
                      key.tone === 'muted' && styles.keyMuted,
                    ]}
                    onPress={key.onPress}
                  >
                    <Text
                      style={[
                        styles.keyText,
                        key.tone === 'op' && styles.keyTextOnAccent,
                        key.tone === 'eq' && { color: colors.onPrimary },
                      ]}
                    >
                      {key.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      ...elevatedSurface(colors, isDark),
      borderRadius: radius.lg,
      padding: spacing.md,
      maxWidth: 400,
      width: '100%',
      alignSelf: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    historyScroll: { maxHeight: 56, marginBottom: spacing.sm },
    historyContent: { gap: spacing.xs, paddingRight: spacing.sm },
    historyChip: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      maxWidth: 140,
    },
    historyExpr: { fontSize: 11, color: colors.textMuted },
    historyResult: { fontSize: 13, fontWeight: '600', color: colors.text },
    expression: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'right',
      minHeight: 18,
    },
    display: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'right',
      marginBottom: spacing.sm,
      fontVariant: ['tabular-nums'],
    },
    pad: { gap: spacing.xs },
    row: { flexDirection: 'row', gap: spacing.xs },
    key: {
      flex: 1,
      minHeight: 48,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBg,
    },
    keyWide: { flex: 2 },
    keyOp: { backgroundColor: colors.primaryContainer },
    keyEq: { backgroundColor: colors.primary },
    keyMuted: { backgroundColor: colors.borderLight },
    keyText: { fontSize: 18, fontWeight: '600', color: colors.text },
    keyTextOnAccent: { color: colors.onPrimaryContainer },
  });
}

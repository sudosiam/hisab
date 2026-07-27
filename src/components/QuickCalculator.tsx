import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { elevatedSurface } from '../constants/shadows';
import { HeaderIconButton } from './HeaderIconButton';

const HISTORY_KEY = '@hisab/calc_history';
const POSITION_KEY = '@hisab/calc_position';
const MAX_HISTORY = 20;
const PANEL_WIDTH = 248;

type HistoryEntry = { expression: string; result: string; at: number };
type SavedPosition = { x: number; y: number };

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

function clamp(n: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

export function CalculatorHeaderButton({
  tintColor,
  trailing = true,
}: {
  tintColor: string;
  trailing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderIconButton
        name="calculator-outline"
        tintColor={tintColor}
        onPress={() => setOpen(true)}
        accessibilityLabel="Open calculator"
        trailing={trailing}
      />
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
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [display, setDisplay] = useState('0');
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const [expression, setExpression] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [panelH, setPanelH] = useState(320);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  const minX = -windowW / 2 + PANEL_WIDTH / 2 + 8;
  const maxX = windowW / 2 - PANEL_WIDTH / 2 - 8;
  const minY = -windowH / 2 + panelH / 2 + insets.top + 8;
  const maxY = windowH / 2 - panelH / 2 - insets.bottom - 8;

  const savePosition = useCallback((x: number, y: number) => {
    void AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ x, y } satisfies SavedPosition));
  }, []);

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

    AsyncStorage.getItem(POSITION_KEY)
      .then((raw) => {
        if (!raw) {
          translateX.value = 0;
          translateY.value = 40;
          return;
        }
        try {
          const parsed = JSON.parse(raw) as SavedPosition;
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            translateX.value = clamp(parsed.x, minX, maxX);
            translateY.value = clamp(parsed.y, minY, maxY);
            return;
          }
        } catch {
          /* ignore */
        }
        translateX.value = 0;
        translateY.value = 40;
      })
      .catch(() => {
        translateX.value = 0;
        translateY.value = 40;
      });
  }, [visible, minX, maxX, minY, maxY, translateX, translateY]);

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

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          dragStartX.value = translateX.value;
          dragStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          translateX.value = clamp(dragStartX.value + e.translationX, minX, maxX);
          translateY.value = clamp(dragStartY.value + e.translationY, minY, maxY);
        })
        .onEnd(() => {
          runOnJS(savePosition)(translateX.value, translateY.value);
        }),
    [dragStartX, dragStartY, translateX, translateY, minX, maxX, minY, maxY, savePosition]
  );

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

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
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss calculator" />
        <Animated.View
          style={[styles.sheet, panelStyle]}
          onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
        >
          <GestureDetector gesture={pan}>
            <Animated.View style={styles.header} accessibilityLabel="Drag calculator">
              <View style={styles.grabber} />
              <Text style={styles.title}>Calc</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </Animated.View>
          </GestureDetector>

          {history.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.historyScroll}
              contentContainerStyle={styles.historyContent}
              keyboardShouldPersistTaps="handled"
            >
              {history.slice(0, 8).map((entry) => (
                <TouchableOpacity
                  key={`${entry.at}-${entry.expression}`}
                  style={styles.historyChip}
                  onPress={() => reuseHistory(entry)}
                >
                  <Text style={styles.historyResult} numberOfLines={1}>
                    {entry.result}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <Text style={styles.expression} numberOfLines={1}>
            {expression}
            {pendingOp ? ` ${pendingOp}` : ''}
          </Text>
          <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit>
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
                    activeOpacity={0.7}
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
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.scrim,
    },
    sheet: {
      ...elevatedSurface(colors, isDark),
      width: PANEL_WIDTH,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      paddingTop: spacing.xs,
      zIndex: 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
      marginBottom: 2,
      gap: spacing.xs,
    },
    grabber: {
      position: 'absolute',
      top: 4,
      alignSelf: 'center',
      width: 28,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginTop: 8,
    },
    closeBtn: {
      position: 'absolute',
      right: 0,
      top: 4,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyScroll: { maxHeight: 28, marginBottom: 4 },
    historyContent: { gap: 4, paddingRight: 4 },
    historyChip: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
      maxWidth: 72,
    },
    historyResult: { fontSize: 11, fontWeight: '600', color: colors.text },
    expression: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'right',
      minHeight: 14,
    },
    display: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'right',
      marginBottom: 6,
      fontVariant: ['tabular-nums'],
    },
    pad: { gap: 4 },
    row: { flexDirection: 'row', gap: 4 },
    key: {
      flex: 1,
      minHeight: 40,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerHigh,
    },
    keyWide: { flex: 2 },
    keyOp: { backgroundColor: colors.primaryContainer },
    keyEq: { backgroundColor: colors.primary },
    keyMuted: { backgroundColor: colors.border },
    keyText: { fontSize: 16, fontWeight: '600', color: colors.text },
    keyTextOnAccent: { color: colors.onPrimaryContainer },
  });
}

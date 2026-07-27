import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { formatCurrencyCompact, formatCurrencyWhole } from '../utils/format';
import { radius, spacing, typography } from '../constants/theme';
import { ThemedPressable } from './ThemedPressable';

export interface MultiLineSeries {
  key: string;
  label: string;
  shortLabel?: string;
  color: string;
  dash?: string;
  values: number[];
}

interface Props {
  labels: string[];
  series: MultiLineSeries[];
  height?: number;
}

const X_LABEL_H = 16;
const PAD = 8;

function xForIndex(index: number, count: number, width: number) {
  if (count <= 1) return width / 2;
  return PAD + (index / (count - 1)) * (width - PAD * 2);
}

function indexFromX(x: number, count: number, width: number) {
  if (count <= 1) return 0;
  const usable = Math.max(width - PAD * 2, 1);
  const t = (x - PAD) / usable;
  return Math.max(0, Math.min(count - 1, Math.round(t * (count - 1))));
}

export function MultiLineTrendChart({ labels, series, height = 176 }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [plotWidth, setPlotWidth] = useState(0);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<number | null>(null);

  const active = useMemo(() => series.filter((s) => !hidden[s.key]), [series, hidden]);

  const allValues = useMemo(
    () => active.flatMap((s) => s.values.map((v) => (Number.isFinite(v) ? v : 0))),
    [active]
  );

  const defaultIndex = useMemo(() => {
    if (labels.length === 0) return 0;
    for (let i = labels.length - 1; i >= 0; i -= 1) {
      if (series.some((s) => (Number.isFinite(s.values[i]) ? s.values[i] : 0) !== 0)) return i;
    }
    return labels.length - 1;
  }, [labels.length, series]);

  const selectedIndex = selected ?? defaultIndex;

  const selectAtX = useCallback(
    (x: number) => {
      if (plotWidth <= 0 || labels.length === 0) return;
      setSelected(indexFromX(x, labels.length, plotWidth));
    },
    [plotWidth, labels.length]
  );

  const gesture = useMemo(() => {
    const scrub = (x: number) => {
      'worklet';
      runOnJS(selectAtX)(x);
    };
    // Horizontal scrub only — vertical moves fail so the dashboard ScrollView still scrolls.
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .onBegin((e) => scrub(e.x))
      .onUpdate((e) => scrub(e.x));
    const tap = Gesture.Tap().maxDuration(220).onEnd((e) => scrub(e.x));
    return Gesture.Simultaneous(tap, pan);
  }, [selectAtX]);

  if (labels.length === 0 || series.length === 0) {
    return <Text style={styles.empty}>No data yet</Text>;
  }

  const lineMax = allValues.length ? Math.max(...allValues, 0) : 0;
  const lineMin = allValues.length ? Math.min(...allValues, 0) : 0;
  const range = Math.max(lineMax - lineMin, 1);
  const plotHeight = height - X_LABEL_H;
  const zeroY = PAD + (plotHeight - PAD * 2) * (1 - (0 - lineMin) / range);
  const selectedX = xForIndex(selectedIndex, labels.length, Math.max(plotWidth, 1));

  const yForValue = (raw: number) => {
    const value = Number.isFinite(raw) ? raw : 0;
    return PAD + (plotHeight - PAD * 2) * (1 - (value - lineMin) / range);
  };

  const toPoints = (values: number[]) => {
    if (plotWidth <= 0 || values.length === 0) return '';
    return values
      .map((raw, index) => `${xForIndex(index, values.length, plotWidth)},${yForValue(raw)}`)
      .join(' ');
  };

  return (
    <View style={styles.root}>
      <View style={styles.metricMatrix}>
        {series.map((s, i) => {
          const off = !!hidden[s.key];
          const value = Number.isFinite(s.values[selectedIndex]) ? s.values[selectedIndex] : 0;
          return (
            <React.Fragment key={s.key}>
              {i > 0 ? <View style={styles.metricVRule} /> : null}
              <ThemedPressable
                style={[styles.metricCell, off && styles.metricOff]}
                onPress={() => setHidden((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                accessibilityRole="button"
                accessibilityState={{ selected: !off }}
                accessibilityLabel={`${s.label} ${formatCurrencyWhole(value)}. Double purpose: tap to ${off ? 'show' : 'hide'} line`}
              >
                <View style={styles.metricTop}>
                  <View style={[styles.swatch, { backgroundColor: off ? colors.border : s.color }]} />
                  <Text style={[styles.metricName, off && styles.metricMuted]} numberOfLines={1}>
                    {s.shortLabel ?? s.label}
                  </Text>
                </View>
                <Text
                  style={[styles.metricValue, off ? styles.metricMuted : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {formatCurrencyWhole(value)}
                </Text>
              </ThemedPressable>
            </React.Fragment>
          );
        })}
      </View>

      <GestureDetector gesture={gesture}>
        <View
          style={[styles.plotShell, { height: plotHeight }]}
          onLayout={(e: LayoutChangeEvent) => setPlotWidth(e.nativeEvent.layout.width)}
          collapsable={false}
        >
          <View style={styles.plotFrame}>
            <View style={styles.yOverlay} pointerEvents="none">
              <Text style={styles.yLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                {formatCurrencyCompact(lineMax)}
              </Text>
              <Text style={styles.yLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                {formatCurrencyCompact(lineMin)}
              </Text>
            </View>

            {plotWidth > 0 ? (
              <Svg width={plotWidth} height={plotHeight} pointerEvents="none">
                <Line
                  x1={0}
                  y1={zeroY}
                  x2={plotWidth}
                  y2={zeroY}
                  stroke={colors.border}
                  strokeWidth={StyleSheet.hairlineWidth * 2}
                />
                {active.map((s) => {
                  const pts = toPoints(s.values);
                  if (!pts) return null;
                  return (
                    <Polyline
                      key={s.key}
                      points={pts}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.key === 'netProfit' ? 2.25 : 1.75}
                      strokeDasharray={s.dash}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  );
                })}
                <Line
                  x1={selectedX}
                  y1={PAD / 2}
                  x2={selectedX}
                  y2={plotHeight - PAD / 2}
                  stroke={colors.primary}
                  strokeWidth={1.25}
                  opacity={0.55}
                />
                {active.map((s) => (
                  <Circle
                    key={`pt-${s.key}`}
                    cx={selectedX}
                    cy={yForValue(s.values[selectedIndex] ?? 0)}
                    r={3.25}
                    fill={colors.surfaceElevated}
                    stroke={s.color}
                    strokeWidth={1.75}
                  />
                ))}
              </Svg>
            ) : null}

            <View style={styles.dayChip} pointerEvents="none">
              <Text style={styles.dayChipText}>Day {labels[selectedIndex]}</Text>
            </View>
          </View>
        </View>
      </GestureDetector>

      <View style={styles.xRow} pointerEvents="none">
        {labels.map((label, index) => (
          <View key={`${label}-${index}`} style={styles.xHit}>
            <Text
              style={[styles.xLabel, index === selectedIndex && styles.xLabelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    root: {
      width: '100%',
      gap: spacing.sm,
    },
    metricMatrix: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: isDark ? colors.surfaceContainer : colors.surfaceContainerHigh,
    },
    metricVRule: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      alignSelf: 'stretch',
    },
    metricCell: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      gap: 3,
      justifyContent: 'center',
      minHeight: 52,
    },
    metricOff: {
      opacity: 0.38,
    },
    metricTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      minWidth: 0,
    },
    swatch: {
      width: 7,
      height: 7,
      borderRadius: 2,
      flexShrink: 0,
    },
    metricName: {
      ...typography.micro,
      fontWeight: '600',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      flexShrink: 1,
      minWidth: 0,
    },
    metricMuted: {
      color: colors.textMuted,
    },
    metricValue: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: -0.25,
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    plotShell: {
      width: '100%',
    },
    plotFrame: {
      flex: 1,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: isDark ? colors.surfaceContainer : colors.surfaceContainerHigh,
      overflow: 'hidden',
      position: 'relative',
    },
    yOverlay: {
      position: 'absolute',
      left: 6,
      top: 6,
      bottom: 6,
      width: 34,
      justifyContent: 'space-between',
      zIndex: 1,
    },
    yLabel: {
      fontSize: 8,
      color: colors.textMuted,
      fontWeight: '500',
    },
    dayChip: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      zIndex: 2,
    },
    dayChipText: {
      ...typography.micro,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    xRow: {
      flexDirection: 'row',
      width: '100%',
      paddingHorizontal: 2,
    },
    xHit: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    xLabel: {
      width: '100%',
      fontSize: 7,
      lineHeight: 10,
      color: colors.textMuted,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    xLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    empty: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
}

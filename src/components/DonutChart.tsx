import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { formatCurrencyCompact, formatCurrencyWhole } from '../utils/format';
import { spacing, typography } from '../constants/theme';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface Props {
  slices: DonutSlice[];
  size?: number;
  amountsHidden?: boolean;
  emptyLabel?: string;
}

const PALETTE = ['#3B5B84', '#2F7A4F', '#A35C0F', '#B93A3A', '#6B7280', '#5B8A9A', '#8B6B4A', '#4A6D9A'];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export function DonutChart({
  slices,
  size = 148,
  amountsHidden = false,
  emptyLabel = 'No data',
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const positive = useMemo(
    () =>
      slices
        .map((s, i) => ({
          ...s,
          value: Number.isFinite(s.value) && s.value > 0 ? s.value : 0,
          color: s.color ?? PALETTE[i % PALETTE.length],
        }))
        .filter((s) => s.value > 0),
    [slices]
  );

  const total = positive.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0 || positive.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const stroke = Math.max(14, size * 0.12);

  let angle = 0;
  const arcs = positive.map((slice) => {
    const sweep = (slice.value / total) * 360;
    const start = angle;
    const end = angle + Math.max(sweep, 0.5);
    angle = end;
    return { ...slice, start, end, pct: (slice.value / total) * 100 };
  });

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke={colors.borderLight} strokeWidth={stroke} fill="none" />
          <G>
            {arcs.map((arc) => (
              <Path
                key={arc.key}
                d={arcPath(cx, cy, r, arc.start, arc.end)}
                stroke={arc.color}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="butt"
              />
            ))}
          </G>
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerLabel}>Total</Text>
          <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
            {amountsHidden ? '••••' : formatCurrencyCompact(total)}
          </Text>
        </View>
      </View>
      <View style={styles.legend}>
        {arcs.map((arc) => (
          <View key={arc.key} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: arc.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {arc.label}
            </Text>
            <Text style={styles.legendValue}>
              {amountsHidden ? '••' : formatCurrencyWhole(arc.value)}
            </Text>
            <Text style={styles.legendPct}>{Math.round(arc.pct)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    center: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    centerLabel: {
      ...typography.micro,
      color: colors.textMuted,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    centerValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    legend: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    swatch: {
      width: 8,
      height: 8,
      borderRadius: 2,
      flexShrink: 0,
    },
    legendLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: colors.text,
    },
    legendValue: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    legendPct: {
      width: 32,
      textAlign: 'right',
      fontSize: 10,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    empty: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
}

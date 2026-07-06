import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/format';
import { spacing, radius } from '../constants/theme';

interface ChartPoint {
  label: string;
  value: number;
}

interface Props {
  data: ChartPoint[];
  variant: 'bar' | 'line';
  height?: number;
}

const X_LABEL_HEIGHT = 18;
const PLOT_PADDING = 6;

export function GrowthChart({ data, variant, height = 140 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, height), [colors, height]);
  const [plotWidth, setPlotWidth] = useState(0);

  const onPlotLayout = (event: LayoutChangeEvent) => {
    setPlotWidth(event.nativeEvent.layout.width);
  };

  // One NaN/Infinity value would otherwise poison every bar/line height below.
  const safeData = data.map((d) => ({
    ...d,
    value: Number.isFinite(d.value) ? d.value : 0,
  }));

  if (safeData.length === 0) {
    return <Text style={styles.empty}>No data yet</Text>;
  }

  const values = safeData.map((d) => d.value);
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const maxPositive = Math.max(...values.filter((v) => v >= 0), 0);
  const maxNegative = Math.max(...values.filter((v) => v < 0).map((v) => Math.abs(v)), 0);
  const halfHeight = height / 2;

  if (variant === 'line') {
    const plotHeight = height - X_LABEL_HEIGHT;
    const lineMax = Math.max(...values, 0);
    const lineMin = Math.min(...values, 0);
    const range = Math.max(lineMax - lineMin, 1);

    const points =
      plotWidth > 0 && safeData.length > 0
        ? safeData.map((point, index) => {
            const x =
              safeData.length === 1
                ? plotWidth / 2
                : PLOT_PADDING + (index / (safeData.length - 1)) * (plotWidth - PLOT_PADDING * 2);
            const y =
              PLOT_PADDING +
              (plotHeight - PLOT_PADDING * 2) * (1 - (point.value - lineMin) / range);
            return { x, y, label: point.label };
          })
        : [];

    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

    return (
      <View style={styles.wrap}>
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{formatCurrency(lineMax)}</Text>
          <Text style={styles.axisLabel}>{formatCurrency(lineMin + range / 2)}</Text>
          <Text style={styles.axisLabel}>{formatCurrency(lineMin)}</Text>
        </View>
        <View style={styles.plotArea}>
          <View style={[styles.linePlotWrap, { height: plotHeight }]} onLayout={onPlotLayout}>
            {plotWidth > 0 ? (
              <Svg width={plotWidth} height={plotHeight}>
                <Line
                  x1={0}
                  y1={plotHeight - PLOT_PADDING}
                  x2={plotWidth}
                  y2={plotHeight - PLOT_PADDING}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                {points.length > 1 && polylinePoints.length > 0 ? (
                  <Polyline
                    points={polylinePoints}
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {points.map((point, index) => (
                  <Circle
                    key={`${point.label}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={4}
                    fill={colors.surface}
                    stroke={colors.primary}
                    strokeWidth={2}
                  />
                ))}
              </Svg>
            ) : null}
          </View>
          <View style={styles.xLabelRow}>
            {safeData.map((point, index) => (
              <Text key={`${point.label}-${index}`} style={styles.xLabel} numberOfLines={1}>
                {point.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.yAxis}>
        <Text style={styles.axisLabel}>{formatCurrency(maxPositive)}</Text>
        <Text style={styles.axisLabel}>₹0</Text>
        <Text style={styles.axisLabel}>
          {maxNegative > 0 ? `−${formatCurrency(maxNegative).replace('₹', '')}` : '₹0'}
        </Text>
      </View>
      <View style={styles.plotArea}>
        <View style={[styles.barPlot, { height }]}>
          <View style={styles.zeroLine} />
          {safeData.map((point, index) => {
            const magnitude = (Math.abs(point.value) / maxAbs) * (halfHeight - 6);
            const isPositive = point.value >= 0;
            return (
              <View key={`${point.label}-${index}`} style={styles.barColumn}>
                <View style={styles.barHalf}>
                  {isPositive ? (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(magnitude, point.value !== 0 ? 4 : 0),
                          backgroundColor: colors.success,
                        },
                      ]}
                    />
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                </View>
                <View style={styles.barHalf}>
                  {!isPositive ? (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(magnitude, point.value !== 0 ? 4 : 0),
                          backgroundColor: colors.danger,
                        },
                      ]}
                    />
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                </View>
                <Text style={styles.xLabel}>{point.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], height: number) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    yAxis: {
      width: 72,
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
    },
    axisLabel: {
      fontSize: 9,
      color: colors.textMuted,
      textAlign: 'right',
    },
    plotArea: { flex: 1 },
    barPlot: {
      flexDirection: 'row',
      alignItems: 'stretch',
      position: 'relative',
    },
    linePlotWrap: {
      width: '100%',
    },
    xLabelRow: {
      flexDirection: 'row',
      marginTop: 4,
    },
    zeroLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: height / 2,
      height: 1,
      backgroundColor: colors.border,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
    },
    barHalf: {
      height: height / 2 - 14,
      justifyContent: 'flex-end',
      width: '100%',
      alignItems: 'center',
    },
    bar: {
      width: '65%',
      borderRadius: radius.sm,
      minHeight: 0,
    },
    xLabel: {
      flex: 1,
      fontSize: 8,
      color: colors.textMuted,
      textAlign: 'center',
    },
    empty: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });
}

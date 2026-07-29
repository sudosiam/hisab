import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatCurrencyCompact } from '../utils/format';
import { radius, spacing, typography } from '../constants/theme';

export interface SimpleBarItem {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface Props {
  items: SimpleBarItem[];
  height?: number;
  amountsHidden?: boolean;
}

/** Horizontal comparison bars for cash-flow section nets. */
export function SimpleBarChart({ items, height = 120, amountsHidden = false }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const safe = items.map((item) => ({
    ...item,
    value: Number.isFinite(item.value) ? item.value : 0,
  }));
  const maxAbs = Math.max(...safe.map((i) => Math.abs(i.value)), 1);

  if (safe.every((i) => i.value === 0)) {
    return <Text style={styles.empty}>No cash movement</Text>;
  }

  return (
    <View style={[styles.wrap, { minHeight: height }]}>
      {safe.map((item) => {
        const widthPct = (Math.abs(item.value) / maxAbs) * 100;
        const color =
          item.color ?? (item.value >= 0 ? colors.success : colors.danger);
        return (
          <View key={item.key} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.max(widthPct, item.value !== 0 ? 4 : 0)}%`,
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
            <Text style={styles.value} numberOfLines={1}>
              {amountsHidden ? '••••' : formatCurrencyCompact(item.value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    label: {
      width: 78,
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    track: {
      flex: 1,
      height: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceContainerHigh,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: radius.sm,
    },
    value: {
      width: 64,
      textAlign: 'right',
      fontSize: 11,
      fontWeight: '700',
      color: colors.text,
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

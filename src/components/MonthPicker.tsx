import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ALL_PERIOD_KEY,
  getCurrentMonthKey,
  isAllPeriodKey,
  isFinancialYearPeriodKey,
  makeFinancialYearPeriodKey,
  periodKeyToLabel,
  shiftPeriod,
} from '../utils/date';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';

const ACTIVE_OPACITY = 0.75;

interface Props {
  monthKey: string;
  onChange: (monthKey: string) => void;
  /** Cycle Month → FY → All time (for payment history, etc.). Default: Month ↔ FY. */
  allowAllTime?: boolean;
}

export function MonthPicker({ monthKey, onChange, allowAllTime = false }: Props) {
  const { colors } = useTheme();
  const { selectedFyStartYear } = useFinancialYear();
  const isFinancialYear = isFinancialYearPeriodKey(monthKey);
  const isAllTime = isAllPeriodKey(monthKey);
  const styles = useMemo(
    () => createStyles(colors, isFinancialYear || isAllTime),
    [colors, isFinancialYear, isAllTime]
  );

  const handleCenterPress = () => {
    if (allowAllTime) {
      // Month → FY → All → Month
      if (isAllTime) {
        onChange(getCurrentMonthKey());
        return;
      }
      if (isFinancialYear) {
        onChange(ALL_PERIOD_KEY);
        return;
      }
      onChange(makeFinancialYearPeriodKey(selectedFyStartYear));
      return;
    }
    if (isFinancialYear) {
      onChange(getCurrentMonthKey());
      return;
    }
    onChange(makeFinancialYearPeriodKey(selectedFyStartYear));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.btn, isAllTime && { opacity: 0.35 }]}
          onPress={() => {
            if (!isAllTime) {
              void import('../utils/haptics').then((m) => m.hapticLight());
              onChange(shiftPeriod(monthKey, -1));
            }
          }}
          disabled={isAllTime}
          activeOpacity={ACTIVE_OPACITY}
          accessibilityRole="button"
          accessibilityLabel="Previous period"
        >
          <Ionicons name="chevron-back" size={18} color={colors.onPrimaryContainer} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.labelWrap}
          onPress={() => {
            void import('../utils/haptics').then((m) => m.hapticLight());
            handleCenterPress();
          }}
          activeOpacity={ACTIVE_OPACITY}
          accessibilityRole="button"
          accessibilityLabel={`Current period ${periodKeyToLabel(monthKey)}`}
          accessibilityHint={
            allowAllTime
              ? 'Cycles month, financial year, and all time'
              : isFinancialYear
                ? 'Switches to current month'
                : 'Switches to financial year'
          }
        >
          <Text style={styles.label}>{periodKeyToLabel(monthKey)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, isAllTime && { opacity: 0.35 }]}
          onPress={() => {
            if (!isAllTime) {
              void import('../utils/haptics').then((m) => m.hapticLight());
              onChange(shiftPeriod(monthKey, 1));
            }
          }}
          disabled={isAllTime}
          activeOpacity={ACTIVE_OPACITY}
          accessibilityRole="button"
          accessibilityLabel="Next period"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.onPrimaryContainer} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isFinancialYear: boolean
) {
  return StyleSheet.create({
    wrap: { marginBottom: 0 },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: radius.md,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 2,
      paddingHorizontal: 2,
      minHeight: 44,
    },
    btn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      backgroundColor: colors.primaryContainer,
    },
    labelWrap: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
    },
    label: {
      ...typography.label,
      fontSize: 13,
      fontWeight: '600',
      color: isFinancialYear ? colors.onPrimaryContainer : colors.text,
      textAlign: 'center',
    },
  });
}

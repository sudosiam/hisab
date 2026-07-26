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
            if (!isAllTime) onChange(shiftPeriod(monthKey, -1));
          }}
          disabled={isAllTime}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Previous period"
        >
          <Ionicons name="chevron-back" size={18} color={colors.onPrimaryContainer} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.labelWrap}
          onPress={handleCenterPress}
          activeOpacity={0.7}
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
          <Text style={styles.hint}>
            {allowAllTime
              ? isAllTime
                ? 'Tap for current month'
                : isFinancialYear
                  ? 'Tap for all time'
                  : 'Tap for full financial year'
              : isFinancialYear
                ? 'Tap for current month'
                : 'Tap for full financial year'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, isAllTime && { opacity: 0.35 }]}
          onPress={() => {
            if (!isAllTime) onChange(shiftPeriod(monthKey, 1));
          }}
          disabled={isAllTime}
          activeOpacity={0.7}
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
    wrap: { marginBottom: spacing.sm },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainer,
      paddingVertical: 2,
      paddingHorizontal: 2,
    },
    btn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
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
    hint: {
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 1,
    },
  });
}

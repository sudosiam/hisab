import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getCurrentMonthKey,
  isFinancialYearPeriodKey,
  makeFinancialYearPeriodKey,
  periodKeyToLabel,
  shiftPeriod,
} from '../utils/date';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface } from '../constants/shadows';

interface Props {
  monthKey: string;
  onChange: (monthKey: string) => void;
}

export function MonthPicker({ monthKey, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const { selectedFyStartYear } = useFinancialYear();
  const isFinancialYear = isFinancialYearPeriodKey(monthKey);
  const styles = useMemo(() => createStyles(colors, isDark, isFinancialYear), [colors, isDark, isFinancialYear]);

  const handleCenterPress = () => {
    if (isFinancialYear) {
      onChange(getCurrentMonthKey());
      return;
    }
    onChange(makeFinancialYearPeriodKey(selectedFyStartYear));
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange(shiftPeriod(monthKey, -1))}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={16} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.labelWrap} onPress={handleCenterPress} activeOpacity={0.7}>
        <Text style={styles.label}>{periodKeyToLabel(monthKey)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange(shiftPeriod(monthKey, 1))}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean,
  isFinancialYear: boolean
) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      alignSelf: 'center',
      width: '85%',
      ...cardSurface(colors, isDark),
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.sm,
    },
    btn: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.navActive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    labelWrap: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
    },
    label: {
      ...typography.label,
      fontSize: 15,
      color: isFinancialYear ? colors.primary : colors.text,
      textAlign: 'center',
    },
  });
}

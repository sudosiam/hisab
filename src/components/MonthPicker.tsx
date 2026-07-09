import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentMonthKey, isFinancialYearPeriodKey, makeFinancialYearPeriodKey, periodKeyToLabel, shiftPeriod } from '../utils/date';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';

interface Props {
  monthKey: string;
  onChange: (monthKey: string) => void;
}

export function MonthPicker({ monthKey, onChange }: Props) {
  const { colors } = useTheme();
  const { selectedFyStartYear } = useFinancialYear();
  const isFinancialYear = isFinancialYearPeriodKey(monthKey);
  const styles = useMemo(() => createStyles(colors, isFinancialYear), [colors, isFinancialYear]);

  const handleCenterPress = () => {
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
          style={styles.btn}
          onPress={() => onChange(shiftPeriod(monthKey, -1))}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Previous period"
        >
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.labelWrap}
          onPress={handleCenterPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Current period ${periodKeyToLabel(monthKey)}`}
          accessibilityHint={isFinancialYear ? 'Switches to current month' : 'Switches to financial year'}
        >
          <Text style={styles.label}>{periodKeyToLabel(monthKey)}</Text>
          <Text style={styles.hint}>
            {isFinancialYear ? 'Tap for current month' : 'Tap for full financial year'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => onChange(shiftPeriod(monthKey, 1))}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Next period"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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
    wrap: { marginBottom: spacing.md },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    btn: {
      width: 36,
      height: 36,
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
      fontSize: 14,
      color: isFinancialYear ? colors.primary : colors.text,
      textAlign: 'center',
    },
    hint: {
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 2,
    },
  });
}

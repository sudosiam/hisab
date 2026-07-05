import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { monthKeyToLabel, shiftMonth } from '../utils/date';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface } from '../constants/shadows';

interface Props {
  monthKey: string;
  onChange: (monthKey: string) => void;
}

export function MonthPicker({ monthKey, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange(shiftMonth(monthKey, -1))}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
      </TouchableOpacity>
      <Text style={styles.label}>{monthKeyToLabel(monthKey)}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange(shiftMonth(monthKey, 1))}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...cardSurface(colors, isDark),
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.md,
    },
    btn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: colors.navActive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...typography.title,
      color: colors.text,
      flex: 1,
      textAlign: 'center',
    },
  });
}

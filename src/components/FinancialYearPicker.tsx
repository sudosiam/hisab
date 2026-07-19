import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';

export interface FinancialYearOption {
  startYear: number;
  label: string;
}

interface Props {
  label?: string;
  options: FinancialYearOption[];
  value: number;
  onChange: (startYear: number) => void;
}

export function FinancialYearPicker({
  label = 'Financial Year',
  options,
  value,
  onChange,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.startYear === value);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={styles.triggerText}>{selected?.label ?? 'Select year'}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.startYear)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.startYear === value && styles.optionActive]}
                  onPress={() => {
                    onChange(item.startYear);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[styles.optionText, item.startYear === value && styles.optionTextActive]}
                  >
                    {item.label}
                  </Text>
                  {item.startYear === value ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.sm },
    label: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginBottom: 4 },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 0,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      minHeight: 44,
      backgroundColor: colors.inputBg,
    },
    triggerText: { fontSize: 14, color: colors.text, fontWeight: '500' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      ...cardSurface(colors, isDark),
      maxHeight: '60%',
      padding: spacing.md,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
      minHeight: 44,
    },
    optionActive: { backgroundColor: colors.primaryContainer },
    optionText: { fontSize: 14, color: colors.text },
    optionTextActive: { color: colors.onPrimaryContainer, fontWeight: '600' },
  });
}

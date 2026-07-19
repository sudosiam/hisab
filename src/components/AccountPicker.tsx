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
import { elevatedSurface } from '../constants/shadows';
import type { Account } from '../types';

interface Props {
  label?: string;
  accounts: Account[];
  value: number;
  onChange: (accountId: number) => void;
}

export function AccountPicker({ label = 'Account', accounts, value, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.id === value);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={styles.triggerText}>{selected?.name ?? 'Select account'}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={accounts}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.id === value && styles.optionActive]}
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, item.id === value && styles.optionTextActive]}>
                    {item.name}
                  </Text>
                  {item.id === value ? (
                    <Ionicons name="checkmark" size={18} color={colors.onPrimaryContainer} />
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
      ...elevatedSurface(colors, isDark),
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      maxHeight: '60%',
      padding: spacing.md,
      paddingBottom: spacing.lg,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
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

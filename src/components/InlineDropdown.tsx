import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { elevatedSurface } from '../constants/shadows';
import { claimDropdownOpen, releaseDropdownOpen } from '../utils/dropdownOpen';

export interface InlineDropdownOption<T extends string | number = string> {
  key: string;
  value: T;
  label: string;
  meta?: string;
  metaDanger?: boolean;
}

interface Props<T extends string | number = string> {
  label?: string;
  placeholder?: string;
  valueLabel?: string;
  meta?: string;
  metaDanger?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: InlineDropdownOption<T>[];
  selectedValue?: T | null;
  onSelect: (value: T) => void;
  maxHeight?: number;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  emptyText?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function InlineDropdown<T extends string | number = string>({
  label,
  placeholder = 'Select',
  valueLabel,
  meta,
  metaDanger,
  open,
  onOpenChange,
  options,
  selectedValue,
  onSelect,
  maxHeight = 220,
  header,
  footer,
  emptyText = 'No options',
  style,
  accessibilityLabel,
}: Props<T>) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (open) {
      claimDropdownOpen(close);
    } else {
      releaseDropdownOpen(close);
    }
    return () => releaseDropdownOpen(close);
  }, [open, close]);

  return (
    <View style={[styles.wrap, style, open && styles.wrapOpen]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => onOpenChange(!open)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.triggerBody}>
          <Text style={[styles.triggerText, !valueLabel && styles.placeholder]} numberOfLines={1}>
            {valueLabel || placeholder}
          </Text>
          {meta ? (
            <Text style={[styles.meta, metaDanger && { color: colors.danger }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {open ? (
        <View style={[styles.panel, { maxHeight }]}>
          {header}
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {options.length === 0 ? (
              <Text style={styles.empty}>{emptyText}</Text>
            ) : (
              options.map((opt) => {
                const selected = selectedValue === opt.value;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.option, selected && styles.optionActive]}
                    onPress={() => {
                      onSelect(opt.value);
                      onOpenChange(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.optionText, selected && styles.optionTextActive]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                      {opt.meta ? (
                        <Text
                          style={[
                            styles.meta,
                            opt.metaDanger && { color: colors.danger },
                            selected && styles.metaActive,
                          ]}
                          numberOfLines={1}
                        >
                          {opt.meta}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.sm, zIndex: 1 },
    wrapOpen: { zIndex: 40 },
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
      gap: spacing.sm,
    },
    triggerBody: { flex: 1, minWidth: 0 },
    triggerText: { fontSize: 14, color: colors.text, fontWeight: '600' },
    placeholder: { color: colors.textMuted, fontWeight: '500' },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    metaActive: { color: colors.textSecondary },
    panel: {
      ...elevatedSurface(colors, isDark),
      marginTop: 4,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
      paddingVertical: 4,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      minHeight: 44,
    },
    optionActive: { backgroundColor: colors.navActive },
    optionText: { fontSize: 14, color: colors.text, fontWeight: '500' },
    optionTextActive: { fontWeight: '700', color: colors.text },
    empty: {
      textAlign: 'center',
      color: colors.textMuted,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      fontSize: 13,
    },
  });
}

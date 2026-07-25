import React, { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius } from '../../constants/theme';
import { cardSurface } from '../../constants/shadows';

export function useSettingsStyles() {
  const { colors, isDark } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        sectionCard: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.md,
        },
        themeRow: {
          flexDirection: 'row',
          gap: spacing.xs,
        },
        settingsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          minHeight: 48,
          gap: spacing.md,
        },
        rowStack: {
          flex: 1,
        },
        rowLabel: {
          fontSize: 14,
          fontWeight: '500',
          color: colors.text,
        },
        rowMeta: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: 1,
        },
        rowAction: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.primary,
        },
        buttonStack: {
          gap: spacing.sm,
          marginTop: spacing.sm,
        },
        outlineBtn: {
          paddingVertical: 11,
          minHeight: 44,
          borderRadius: radius.full,
          borderWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primaryContainer,
        },
        outlineBtnText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.onPrimaryContainer,
        },
        dangerBtn: {
          paddingVertical: 11,
          minHeight: 44,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.danger + '44',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        },
        dangerText: {
          color: colors.danger,
          fontWeight: '600',
          fontSize: 14,
        },
        aboutRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.xs,
          minHeight: 40,
        },
        aboutLabel: {
          fontSize: 14,
          color: colors.textSecondary,
        },
        aboutValue: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: spacing.md,
        },
        modalSheet: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          borderRadius: radius.xl,
        },
        modalTitle: {
          fontSize: 17,
          fontWeight: '700',
          color: colors.text,
          marginBottom: spacing.xs,
        },
        modalText: {
          fontSize: 13,
          color: colors.textSecondary,
          lineHeight: 18,
          marginBottom: spacing.md,
        },
        modalActions: {
          flexDirection: 'row',
          gap: spacing.sm,
          marginTop: spacing.md,
        },
        modalCancel: {
          flex: 1,
          paddingVertical: 11,
          minHeight: 44,
          borderRadius: radius.full,
          borderWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceContainer,
        },
        modalCancelText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        monthGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.xs,
          marginTop: spacing.sm,
        },
        monthChip: {
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs + 2,
          borderRadius: radius.full,
          borderWidth: 0,
          backgroundColor: colors.surfaceContainer,
        },
        monthChipActive: {
          backgroundColor: colors.primaryContainer,
          borderColor: colors.primaryContainer,
        },
        monthChipText: {
          fontSize: 13,
          color: colors.text,
        },
        monthChipTextActive: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.onPrimaryContainer,
        },
        navCard: {
          ...cardSurface(colors, isDark),
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          minHeight: 52,
          marginBottom: spacing.xs + 2,
          gap: spacing.sm,
        },
        navIconWrap: {
          width: 32,
          height: 32,
          borderRadius: radius.full,
          backgroundColor: colors.primaryContainer,
          alignItems: 'center',
          justifyContent: 'center',
        },
        navBody: { flex: 1, minWidth: 0 },
        navTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
        navSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1, lineHeight: 16 },
      }),
    [colors, isDark]
  );
}

export function SettingsDivider({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color, marginVertical: spacing.xs }} />;
}

export function SettingsNavCard({
  title,
  desc,
  icon,
  onPress,
  chevronColor,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  onPress: () => void;
  chevronColor: string;
}) {
  const styles = useSettingsStyles();
  return (
    <TouchableOpacity
      style={styles.navCard}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.navIconWrap}>{icon}</View>
      <View style={styles.navBody}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSub}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={chevronColor} />
    </TouchableOpacity>
  );
}

import type { ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import type { ThemeColors } from './theme';
import { radius } from './theme';

/** Cool minimal card — hairline border, no elevation. */
export function cardSurface(colors: ThemeColors, _isDark: boolean): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  };
}

/** Slightly raised surface via tonal fill + hairline (no shadow). */
export function elevatedSurface(colors: ThemeColors, _isDark: boolean): ViewStyle {
  return {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  };
}

export function primaryShadow(_isDark: boolean): ViewStyle {
  return {};
}

/** Soft FAB elevation — only intentional shadow in the system. */
export function fabShadow(isDark: boolean, shadowColor: string): ViewStyle {
  return {
    shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.28 : 0.1,
    shadowRadius: 6,
    elevation: 3,
  };
}

import type { ViewStyle } from 'react-native';
import type { ThemeColors } from './theme';
import { radius } from './theme';

/** Flat card — border-first, minimal elevation (classic accounting UI). */
export function cardSurface(colors: ThemeColors, isDark: boolean): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...(isDark
      ? {}
      : {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 3,
          elevation: 1,
        }),
  };
}

export function elevatedSurface(colors: ThemeColors, isDark: boolean): ViewStyle {
  return {
    ...cardSurface(colors, isDark),
    backgroundColor: colors.surfaceElevated,
  };
}

export function primaryShadow(_isDark: boolean): ViewStyle {
  return {};
}

export function fabShadow(isDark: boolean): ViewStyle {
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.12,
    shadowRadius: 6,
    elevation: 3,
  };
}

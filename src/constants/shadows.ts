import type { ViewStyle } from 'react-native';
import type { ThemeColors } from './theme';
import { radius } from './theme';

/** M3 card — soft elevation in light, tonal border in dark. */
export function cardSurface(colors: ThemeColors, isDark: boolean): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border,
    ...(isDark
      ? {}
      : {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
          elevation: 1,
        }),
  };
}

/** Slightly raised surface (sheets, hero, elevated cards). */
export function elevatedSurface(colors: ThemeColors, isDark: boolean): ViewStyle {
  return {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border,
    ...(isDark
      ? {}
      : {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 2,
        }),
  };
}

export function primaryShadow(_isDark: boolean): ViewStyle {
  return {};
}

/** Circular FAB elevation (Material 3). */
export function fabShadow(isDark: boolean): ViewStyle {
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.35 : 0.16,
    shadowRadius: 8,
    elevation: 4,
  };
}

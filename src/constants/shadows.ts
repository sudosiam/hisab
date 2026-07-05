import type { ViewStyle } from 'react-native';
import type { ThemeColors } from './theme';
import { radius } from './theme';

export function cardSurface(colors: ThemeColors, isDark: boolean): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...(isDark
      ? {
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 8,
          elevation: 2,
        }
      : {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.07,
          shadowRadius: 16,
          elevation: 3,
        }),
  };
}

export function elevatedSurface(colors: ThemeColors, isDark: boolean): ViewStyle {
  return {
    ...cardSurface(colors, isDark),
    backgroundColor: colors.surfaceElevated,
  };
}

export function primaryShadow(isDark: boolean): ViewStyle {
  return {
    shadowColor: '#268DDD',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.28,
    shadowRadius: 12,
    elevation: 6,
  };
}

export function fabShadow(isDark: boolean): ViewStyle {
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.35 : 0.18,
    shadowRadius: 16,
    elevation: 8,
  };
}

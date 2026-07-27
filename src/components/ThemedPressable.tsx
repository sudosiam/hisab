import React, { useCallback } from 'react';
import {
  Pressable,
  Platform,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

export const ACTIVE_OPACITY = 0.75;

export type ThemedPressableHaptic = 'light' | 'warning' | false;

export type ThemedPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Soft opacity feedback on iOS / when ripple is unavailable. */
  activeOpacity?: number;
  haptic?: ThemedPressableHaptic;
};

/**
 * Shared press target: Android ripple + opacity + optional settings-gated haptics.
 */
export function ThemedPressable({
  style,
  activeOpacity = ACTIVE_OPACITY,
  haptic = 'light',
  onPress,
  onLongPress,
  android_ripple,
  children,
  ...rest
}: ThemedPressableProps) {
  const { colors } = useTheme();

  const fireHaptic = useCallback(() => {
    if (!haptic) return;
    void import('../utils/haptics').then((m) =>
      haptic === 'warning' ? m.hapticWarning() : m.hapticLight()
    );
  }, [haptic]);

  return (
    <Pressable
      {...rest}
      android_ripple={
        android_ripple === null
          ? undefined
          : (android_ripple ?? {
              color: colors.overlay,
              borderless: false,
            })
      }
      onPress={(e) => {
        fireHaptic();
        onPress?.(e);
      }}
      onLongPress={
        onLongPress
          ? (e) => {
              fireHaptic();
              onLongPress(e);
            }
          : undefined
      }
      style={(state) => [
        style,
        Platform.OS !== 'android' && state.pressed ? { opacity: activeOpacity } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

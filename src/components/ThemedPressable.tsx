import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  Platform,
  AccessibilityInfo,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { easeOut, motion } from '../constants/motion';

export const ACTIVE_OPACITY = 0.75;

export type ThemedPressableHaptic = 'light' | 'warning' | false;

export type ThemedPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Soft opacity feedback when scale is off (list rows). */
  activeOpacity?: number;
  haptic?: ThemedPressableHaptic;
  /** Soft scale press. Off for flush matrix/list rows. */
  scaleOnPress?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Shared press target: Android ripple + scale/opacity + optional settings-gated haptics.
 */
export function ThemedPressable({
  style,
  activeOpacity = ACTIVE_OPACITY,
  haptic = 'light',
  scaleOnPress = true,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  android_ripple,
  disabled,
  children,
  ...rest
}: ThemedPressableProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const fireHaptic = useCallback(() => {
    if (!haptic) return;
    void import('../utils/haptics').then((m) =>
      haptic === 'warning' ? m.hapticWarning() : m.hapticLight()
    );
  }, [haptic]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const setPressed = (pressed: boolean) => {
    if (disabled || reduceMotion) return;
    const timing = {
      duration: pressed ? motion.pressIn : motion.pressOut,
      easing: easeOut,
      reduceMotion: ReduceMotion.System,
    };
    if (scaleOnPress) {
      scale.value = withTiming(pressed ? motion.pressScale : 1, timing);
    } else if (Platform.OS !== 'android') {
      opacity.value = withTiming(pressed ? activeOpacity : 1, timing);
    }
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      android_ripple={
        android_ripple === null
          ? undefined
          : (android_ripple ?? {
              color: colors.overlay,
              borderless: false,
            })
      }
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
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
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { spacing, typography, radius } from '../constants/theme';

export function AppBootScreen() {
  const { colors } = useTheme();
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [pulse]);

  const indicatorStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: spacing.xl,
        },
        logo: {
          width: 88,
          height: 88,
          borderRadius: radius.lg,
          marginBottom: spacing.md,
        },
        brand: {
          ...typography.display,
          fontSize: 26,
          color: colors.text,
          letterSpacing: -0.3,
          fontWeight: '700',
        },
        tagline: {
          marginTop: spacing.sm,
          fontSize: 13,
          color: colors.textSecondary,
          letterSpacing: 0.2,
        },
        indicator: {
          marginTop: spacing.xl,
          width: 40,
          height: 4,
          borderRadius: 999,
          backgroundColor: colors.primaryContainer,
        },
      }),
    [colors]
  );

  return (
    <View style={styles.root}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} />
      <Text style={styles.brand}>Hisab</Text>
      <Text style={styles.tagline}>Business accounts</Text>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
    </View>
  );
}

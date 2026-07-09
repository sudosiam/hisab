import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, typography } from '../constants/theme';

export function AppBootScreen() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

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
        brand: {
          ...typography.display,
          fontSize: 28,
          color: colors.text,
          letterSpacing: -0.3,
        },
        tagline: {
          marginTop: spacing.sm,
          fontSize: 14,
          color: colors.textSecondary,
          letterSpacing: 0.2,
        },
        indicator: {
          marginTop: spacing.xl,
          width: 36,
          height: 4,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
      }),
    [colors]
  );

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>Hisab</Text>
      <Text style={styles.tagline}>Business accounts</Text>
      <Animated.View style={[styles.indicator, { opacity: pulse }]} />
    </View>
  );
}

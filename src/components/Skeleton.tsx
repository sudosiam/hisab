import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../constants/theme';

export function SkeletonBar({
  width = '100%',
  height = 14,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceContainer,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Full-screen list placeholder used while booting empty screens. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { padding: spacing.md, gap: spacing.md },
        row: { gap: 8 },
      }),
    []
  );

  return (
    <View style={styles.wrap} accessibilityLabel="Loading">
      <SkeletonBar width="40%" height={18} />
      <SkeletonBar width="70%" height={12} />
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBar width="55%" height={14} />
          <SkeletonBar width="28%" height={14} style={{ alignSelf: 'flex-end' }} />
        </View>
      ))}
    </View>
  );
}

export function DashboardSkeleton() {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { padding: spacing.md, gap: spacing.md },
        hero: { gap: 10, marginBottom: spacing.sm },
        cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
      }),
    []
  );

  return (
    <View style={styles.wrap} accessibilityLabel="Loading dashboard">
      <View style={styles.hero}>
        <SkeletonBar width="50%" height={16} />
        <SkeletonBar width="70%" height={28} />
        <SkeletonBar width="40%" height={12} />
      </View>
      <View style={styles.cards}>
        <SkeletonBar width="47%" height={72} />
        <SkeletonBar width="47%" height={72} />
        <SkeletonBar width="47%" height={72} />
        <SkeletonBar width="47%" height={72} />
      </View>
      <SkeletonBar width="35%" height={14} />
      <SkeletonBar height={48} />
      <SkeletonBar height={48} />
      <SkeletonBar height={48} />
    </View>
  );
}

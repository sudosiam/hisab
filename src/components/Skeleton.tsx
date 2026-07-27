import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { cardSurface } from '../constants/shadows';
import { radius, spacing } from '../constants/theme';

const SkeletonPulseContext = createContext<SharedValue<number> | null>(null);

function SkeletonPulseProvider({ children }: { children: React.ReactNode }) {
  const progress = useSharedValue(0.45);
  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [progress]);
  return (
    <SkeletonPulseContext.Provider value={progress}>{children}</SkeletonPulseContext.Provider>
  );
}

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
  const shared = useContext(SkeletonPulseContext);
  const local = useSharedValue(0.45);

  useEffect(() => {
    if (shared) return;
    local.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [shared, local]);

  const progress = shared ?? local;
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceContainerHigh,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Full-screen list placeholder used while booting empty screens. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { padding: spacing.md },
        row: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.lg,
          minHeight: 52,
          marginBottom: spacing.xs + 2,
          backgroundColor: colors.surfaceContainer,
          gap: 8,
          justifyContent: 'center',
        },
      }),
    [colors, isDark]
  );

  return (
    <SkeletonPulseProvider>
      <View style={styles.wrap} accessibilityLabel="Loading">
        <SkeletonBar width="40%" height={18} style={{ marginBottom: spacing.md }} />
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} style={styles.row}>
            <SkeletonBar width="55%" height={14} />
            <SkeletonBar width="28%" height={14} style={{ alignSelf: 'flex-end' }} />
          </View>
        ))}
      </View>
    </SkeletonPulseProvider>
  );
}

export function DashboardSkeleton() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { padding: spacing.md, gap: spacing.md },
        hero: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceElevated,
          gap: spacing.sm,
        },
        scoreRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 40,
          paddingVertical: 6,
        },
        tileRow: { flexDirection: 'row', alignItems: 'stretch' },
        tile: {
          flex: 1,
          minHeight: 64,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm + 2,
          gap: 4,
          justifyContent: 'center',
        },
        matrix: {
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: isDark ? colors.surfaceContainer : colors.surfaceContainerHigh,
        },
        vRule: {
          width: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          alignSelf: 'stretch',
        },
        hRule: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
        },
        metricRow: { flexDirection: 'row', alignItems: 'stretch' },
        metric: {
          flex: 1,
          minHeight: 74,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm + 2,
          gap: 4,
          justifyContent: 'center',
        },
        actionPanel: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          gap: spacing.md,
        },
        actionMatrix: {
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: isDark ? colors.surfaceContainer : colors.surfaceContainerHigh,
        },
        actionRow: { flexDirection: 'row', alignItems: 'stretch' },
        action: {
          flex: 1,
          minHeight: 64,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm + 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
      }),
    [colors, isDark]
  );

  return (
    <SkeletonPulseProvider>
      <View style={styles.wrap} accessibilityLabel="Loading dashboard">
        <SkeletonBar width="100%" height={40} style={{ borderRadius: radius.full }} />
        <View style={styles.hero}>
          <View style={styles.scoreRow}>
            <SkeletonBar width="28%" height={10} />
            <SkeletonBar width={28} height={28} style={{ borderRadius: radius.full }} />
          </View>
          <View style={styles.matrix}>
            <View style={styles.tileRow}>
              <View style={styles.tile}>
                <SkeletonBar width="55%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
              <View style={styles.vRule} />
              <View style={styles.tile}>
                <SkeletonBar width="55%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
            </View>
          </View>
          <View style={styles.matrix}>
            <View style={styles.tile}>
              <SkeletonBar width="40%" height={8} />
              <SkeletonBar width="55%" height={14} />
            </View>
          </View>
          <View style={styles.matrix}>
            <View style={styles.tileRow}>
              <View style={styles.tile}>
                <SkeletonBar width="55%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
              <View style={styles.vRule} />
              <View style={styles.tile}>
                <SkeletonBar width="55%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
            </View>
            <View style={styles.hRule} />
            <View style={styles.tileRow}>
              <View style={styles.tile}>
                <SkeletonBar width="55%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
              <View style={styles.vRule} />
              <View style={styles.tile}>
                <SkeletonBar width="55%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
            </View>
          </View>
        </View>
        <View style={styles.hero}>
          <SkeletonBar width="40%" height={12} />
          <View style={styles.matrix}>
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <SkeletonBar width="50%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
              <View style={styles.vRule} />
              <View style={styles.metric}>
                <SkeletonBar width="50%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
            </View>
            <View style={styles.hRule} />
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <SkeletonBar width="50%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
              <View style={styles.vRule} />
              <View style={styles.metric}>
                <SkeletonBar width="50%" height={8} />
                <SkeletonBar width="70%" height={14} />
              </View>
            </View>
          </View>
        </View>
        <View style={styles.actionPanel}>
          <SkeletonBar width="24%" height={10} />
          <View style={styles.actionMatrix}>
            <View style={styles.actionRow}>
              <View style={styles.action}>
                <SkeletonBar width={28} height={28} style={{ borderRadius: radius.sm }} />
                <SkeletonBar width="55%" height={8} />
              </View>
              <View style={styles.vRule} />
              <View style={styles.action}>
                <SkeletonBar width={28} height={28} style={{ borderRadius: radius.sm }} />
                <SkeletonBar width="55%" height={8} />
              </View>
            </View>
            <View style={styles.hRule} />
            <View style={styles.actionRow}>
              <View style={styles.action}>
                <SkeletonBar width={28} height={28} style={{ borderRadius: radius.sm }} />
                <SkeletonBar width="55%" height={8} />
              </View>
              <View style={styles.vRule} />
              <View style={styles.action}>
                <SkeletonBar width={28} height={28} style={{ borderRadius: radius.sm }} />
                <SkeletonBar width="55%" height={8} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </SkeletonPulseProvider>
  );
}

/** Detail screen placeholder with hero bar and card rows. */
export function DetailSkeleton({ rows = 4 }: { rows?: number }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { padding: spacing.md },
        hero: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          borderRadius: radius.lg,
          minHeight: 80,
          marginBottom: spacing.md,
          backgroundColor: colors.surfaceContainer,
          gap: 10,
          justifyContent: 'center',
        },
        row: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.lg,
          minHeight: 52,
          marginBottom: spacing.xs + 2,
          backgroundColor: colors.surfaceContainer,
          gap: 8,
          justifyContent: 'center',
        },
      }),
    [colors, isDark]
  );

  return (
    <SkeletonPulseProvider>
      <View style={styles.wrap} accessibilityLabel="Loading">
        <View style={styles.hero}>
          <SkeletonBar width="35%" height={12} />
          <SkeletonBar width="60%" height={28} />
        </View>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} style={styles.row}>
            <SkeletonBar width="50%" height={14} />
            <SkeletonBar width="25%" height={14} style={{ alignSelf: 'flex-end' }} />
          </View>
        ))}
      </View>
    </SkeletonPulseProvider>
  );
}

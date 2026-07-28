import React from 'react';
import Animated from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { screenFadeIn, sectionEnter } from '../constants/motion';

/** Soft fade for screen bodies (forms, scroll content). */
export function AnimatedScreenBody({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={screenFadeIn()} style={style}>
      {children}
    </Animated.View>
  );
}

/** Staggered section enter for dashboard-style layouts. */
export function AnimatedSection({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={sectionEnter(index)} style={style}>
      {children}
    </Animated.View>
  );
}

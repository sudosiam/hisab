import { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

/** Shared motion language — short, ease-out, reduced-motion aware. */
export const motion = {
  pressIn: 90,
  pressOut: 160,
  screen: 260,
  section: 280,
  stagger: 40,
  layout: 220,
  pressScale: 0.98,
} as const;

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.4, 0, 0.2, 1);

export function screenFadeIn(delayMs = 0) {
  return FadeIn.duration(motion.screen)
    .delay(delayMs)
    .easing(easeOut)
    .reduceMotion(ReduceMotion.System);
}

export function sectionEnter(index = 0) {
  return FadeInDown.duration(motion.section)
    .delay(index * motion.stagger)
    .easing(easeOut)
    .reduceMotion(ReduceMotion.System);
}

import { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

/** Shared motion language — quiet, ease-out, reduced-motion aware. */
export const motion = {
  pressIn: 80,
  pressOut: 140,
  screen: 220,
  section: 240,
  stagger: 32,
  layout: 200,
  pressScale: 0.985,
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

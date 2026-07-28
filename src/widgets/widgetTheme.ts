'use no memo';

import type { HexColor } from 'react-native-android-widget';

/** Shared colors for Android home widgets — cool minimal, muted blue. */
export const widgetColors = {
  bg: '#0B0D10',
  surface: '#12151A',
  border: '#2A2F38',
  text: '#F3F4F6',
  textMuted: '#9CA3AF',
  primary: '#A8C4E8',
  success: '#4ADE80',
  danger: '#F87171',
  warning: '#FBBF24',
  bar: '#3B5B84',
  barProfit: '#2F7A4F',
  button: '#1A2838',
  buttonText: '#D5E3F4',
} as const satisfies Record<string, HexColor>;

export const DEEP_LINKS = {
  home: 'hisab:///',
  salesNew: 'hisab://sales/new',
  paymentsNew: 'hisab://payments/new',
  profitLoss: 'hisab://reports/profit-loss',
  banking: 'hisab://banking',
} as const;

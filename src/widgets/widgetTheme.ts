'use no memo';

import type { HexColor } from 'react-native-android-widget';

/** Shared colors for Android home widgets (high contrast on dark navy). */
export const widgetColors = {
  bg: '#0B1731',
  surface: '#13233F',
  border: '#2A3F5C',
  text: '#F0F4F8',
  textMuted: '#8AA0B8',
  primary: '#D6E3F5',
  success: '#3DDC97',
  danger: '#F07178',
  warning: '#E8A54B',
  bar: '#2C5282',
  barProfit: '#1B7F4B',
  button: '#1E3A5F',
  buttonText: '#D6E3F5',
} as const satisfies Record<string, HexColor>;

export const DEEP_LINKS = {
  home: 'hisab:///',
  salesNew: 'hisab://sales/new',
  paymentsNew: 'hisab://payments/new',
  profitLoss: 'hisab://reports/profit-loss',
  banking: 'hisab://banking',
} as const;

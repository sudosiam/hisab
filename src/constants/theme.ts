export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  accent: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  header: string;
  headerText: string;
  drawer: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  danger: string;
  paid: string;
  partial: string;
  unpaid: string;
  onPrimary: string;
  navActive: string;
  navActiveText: string;
  chip: string;
  chipActive: string;
  chipText: string;
  chipTextActive: string;
  /** Pressable ripple / light wash — not for full-screen scrims. */
  overlay: string;
  /** Drawer / modal dim behind content — always a dark translucent scrim. */
  scrim: string;
  shadow: string;
  inputBg: string;
}

/** Cool minimal — soft gray canvas, ink text, muted blue accent. */
export const lightColors: ThemeColors = {
  primary: '#3B5B84',
  primaryLight: '#4A6D9A',
  primaryContainer: '#E8EEF5',
  onPrimaryContainer: '#243A56',
  accent: '#3B5B84',
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceContainer: '#EEF0F3',
  surfaceContainerHigh: '#E6E9EE',
  header: '#FFFFFF',
  headerText: '#111827',
  drawer: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E2E5EA',
  borderLight: '#EBEDF0',
  success: '#2F7A4F',
  warning: '#A35C0F',
  danger: '#B93A3A',
  paid: '#2F7A4F',
  partial: '#A35C0F',
  unpaid: '#B93A3A',
  onPrimary: '#FFFFFF',
  navActive: '#E8EEF5',
  navActiveText: '#243A56',
  chip: '#EEF0F3',
  chipActive: '#E8EEF5',
  chipText: '#6B7280',
  chipTextActive: '#243A56',
  overlay: 'rgba(17, 24, 39, 0.04)',
  scrim: 'rgba(17, 24, 39, 0.44)',
  shadow: '#111827',
  inputBg: '#EEF0F3',
};

/** AMOLED dark — cool stepped surfaces, muted blue accent. */
export const darkColors: ThemeColors = {
  primary: '#A8C4E8',
  primaryLight: '#C0D4EE',
  primaryContainer: '#1A2838',
  onPrimaryContainer: '#D5E3F4',
  accent: '#A8C4E8',
  background: '#000000',
  surface: '#0B0D10',
  surfaceElevated: '#12151A',
  surfaceContainer: '#12151A',
  surfaceContainerHigh: '#1A1E25',
  header: '#000000',
  headerText: '#F3F4F6',
  drawer: '#000000',
  text: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  border: '#2A2F38',
  borderLight: '#1F242C',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  paid: '#4ADE80',
  partial: '#FBBF24',
  unpaid: '#F87171',
  onPrimary: '#0F1A28',
  navActive: '#1A2838',
  navActiveText: '#D5E3F4',
  chip: '#12151A',
  chipActive: '#1A2838',
  chipText: '#9CA3AF',
  chipTextActive: '#D5E3F4',
  overlay: 'rgba(255, 255, 255, 0.05)',
  /** Dark scrim only — never a white wash over AMOLED content. */
  scrim: 'rgba(0, 0, 0, 0.62)',
  shadow: '#000000',
  inputBg: '#12151A',
};

/** @deprecated Use useTheme() instead */
export const colors = lightColors;

/** Compact density — keep touch targets >= 44px via component minHeights. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  xxl: 36,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 12,
  xl: 16,
  full: 999,
};

export const typography = {
  display: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3, lineHeight: 26 },
  title: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 22 },
  section: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4, lineHeight: 14 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodyMedium: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  micro: { fontSize: 10, fontWeight: '500' as const, lineHeight: 13 },
  metric: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.4, lineHeight: 24 },
};

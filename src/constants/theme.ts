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
  overlay: string;
  shadow: string;
  inputBg: string;
}

/** Material 3 Android palette — navy brand primary, tonal surfaces, compact density. */
export const lightColors: ThemeColors = {
  primary: '#1E3A5F',
  primaryLight: '#2C5282',
  primaryContainer: '#D6E3F5',
  onPrimaryContainer: '#0F243D',
  accent: '#1E3A5F',
  background: '#F0F2F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceContainer: '#E8EBEF',
  surfaceContainerHigh: '#E0E4EA',
  header: '#FFFFFF',
  headerText: '#1C1C1E',
  drawer: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#5C6570',
  textMuted: '#8A939E',
  border: '#D8DCE3',
  borderLight: '#E6E9EE',
  success: '#1B7F4B',
  warning: '#B45309',
  danger: '#C53030',
  paid: '#1B7F4B',
  partial: '#B45309',
  unpaid: '#C53030',
  onPrimary: '#FFFFFF',
  navActive: '#D6E3F5',
  navActiveText: '#0F243D',
  chip: '#E8EBEF',
  chipActive: '#D6E3F5',
  chipText: '#5C6570',
  chipTextActive: '#0F243D',
  overlay: 'rgba(28, 28, 30, 0.04)',
  shadow: '#1C1C1E',
  inputBg: '#E8EBEF',
};

export const darkColors: ThemeColors = {
  primary: '#9EC5EF',
  primaryLight: '#B8D4F4',
  primaryContainer: '#2A3F5C',
  onPrimaryContainer: '#D6E3F5',
  accent: '#9EC5EF',
  background: '#0E1014',
  surface: '#171B22',
  surfaceElevated: '#1E242C',
  surfaceContainer: '#1A1F27',
  surfaceContainerHigh: '#232933',
  header: '#171B22',
  headerText: '#F3F4F6',
  drawer: '#12161C',
  text: '#F3F4F6',
  textSecondary: '#B8C0CC',
  textMuted: '#909AA8',
  border: '#2D343E',
  borderLight: '#242A33',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  paid: '#4ADE80',
  partial: '#FBBF24',
  unpaid: '#F87171',
  onPrimary: '#0F243D',
  navActive: '#2A3F5C',
  navActiveText: '#D6E3F5',
  chip: '#1E242C',
  chipActive: '#2A3F5C',
  chipText: '#D1D5DB',
  chipTextActive: '#D6E3F5',
  overlay: 'rgba(255, 255, 255, 0.05)',
  shadow: '#000000',
  inputBg: '#1A1F27',
};

/** @deprecated Use useTheme() instead */
export const colors = lightColors;

/** Compact Material density — keep touch targets >= 44px via component minHeights. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  xxl: 36,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const typography = {
  display: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 26 },
  title: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.1, lineHeight: 22 },
  section: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5, lineHeight: 14 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodyMedium: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  metric: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.3, lineHeight: 24 },
};

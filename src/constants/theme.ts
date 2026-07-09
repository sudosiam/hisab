export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  accent: string;
  background: string;
  surface: string;
  surfaceElevated: string;
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

/** Classic ledger palette — navy primary, neutral surfaces, restrained accents. */
export const lightColors: ThemeColors = {
  primary: '#1E3A5F',
  primaryLight: '#2C5282',
  accent: '#1E3A5F',
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  header: '#FFFFFF',
  headerText: '#1C1C1E',
  drawer: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#5C6570',
  textMuted: '#8A939E',
  border: '#E2E5EA',
  borderLight: '#ECEEF1',
  success: '#1B7F4B',
  warning: '#B45309',
  danger: '#C53030',
  paid: '#1B7F4B',
  partial: '#B45309',
  unpaid: '#C53030',
  onPrimary: '#FFFFFF',
  navActive: '#EEF2F7',
  navActiveText: '#1E3A5F',
  chip: '#FFFFFF',
  chipActive: '#1E3A5F',
  chipText: '#5C6570',
  chipTextActive: '#FFFFFF',
  overlay: 'rgba(28, 28, 30, 0.03)',
  shadow: '#1C1C1E',
  inputBg: '#FFFFFF',
};

export const darkColors: ThemeColors = {
  primary: '#7EB3E8',
  primaryLight: '#9EC5EF',
  accent: '#7EB3E8',
  background: '#0E1014',
  surface: '#171B22',
  surfaceElevated: '#1E242C',
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
  onPrimary: '#FFFFFF',
  navActive: '#1E2A3A',
  navActiveText: '#9EC5EF',
  chip: '#1E242C',
  chipActive: '#2C5282',
  chipText: '#D1D5DB',
  chipTextActive: '#FFFFFF',
  overlay: 'rgba(255, 255, 255, 0.04)',
  shadow: '#000000',
  inputBg: '#141820',
};

/** @deprecated Use useTheme() instead */
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  full: 999,
};

export const typography = {
  display: { fontSize: 21, fontWeight: '600' as const, letterSpacing: -0.2 },
  title: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.1 },
  section: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  metric: { fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.3 },
};

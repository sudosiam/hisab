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

export const lightColors: ThemeColors = {
  primary: '#1E7FD4',
  primaryLight: '#4DA3E8',
  accent: '#1E7FD4',
  background: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  header: '#FFFFFF',
  headerText: '#111827',
  drawer: '#FFFFFF',
  text: '#111827',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E8ECF1',
  borderLight: '#F1F4F8',
  success: '#0F9D58',
  warning: '#E67E22',
  danger: '#E53935',
  paid: '#0F9D58',
  partial: '#E67E22',
  unpaid: '#E53935',
  onPrimary: '#FFFFFF',
  navActive: '#EDF5FC',
  navActiveText: '#1E7FD4',
  chip: '#FFFFFF',
  chipActive: '#1E7FD4',
  chipText: '#475569',
  chipTextActive: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.04)',
  shadow: '#0F172A',
  inputBg: '#FAFBFD',
};

export const darkColors: ThemeColors = {
  primary: '#5BB0F0',
  primaryLight: '#7DC4F7',
  accent: '#5BB0F0',
  background: '#0B0D10',
  surface: '#15181D',
  surfaceElevated: '#1C2026',
  header: '#15181D',
  headerText: '#F8FAFC',
  drawer: '#101216',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#262B33',
  borderLight: '#1E232A',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  paid: '#34D399',
  partial: '#FBBF24',
  unpaid: '#F87171',
  onPrimary: '#FFFFFF',
  navActive: '#1A2E42',
  navActiveText: '#7DC4F7',
  chip: '#1C2026',
  chipActive: '#5BB0F0',
  chipText: '#CBD5E1',
  chipTextActive: '#FFFFFF',
  overlay: 'rgba(255, 255, 255, 0.04)',
  shadow: '#000000',
  inputBg: '#101216',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const typography = {
  display: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  title: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2 },
  section: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.8 },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  metric: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4 },
};

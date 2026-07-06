import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import {
  darkColors,
  lightColors,
  type ThemeColors,
  type ThemeMode,
  radius,
  spacing,
} from '../constants/theme';

const STORAGE_KEY = '@hisab/theme_mode';

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  spacing: typeof spacing;
  radius: typeof radius;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemeModeState(stored);
        }
      });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const isDark =
    themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const value = useMemo(
    () => ({
      colors,
      isDark,
      themeMode,
      setThemeMode,
      spacing,
      radius,
    }),
    [colors, isDark, themeMode, setThemeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

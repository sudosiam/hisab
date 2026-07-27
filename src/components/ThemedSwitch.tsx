import React from 'react';
import { Switch } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function ThemedSwitch(props: React.ComponentProps<typeof Switch>) {
  const { colors, isDark } = useTheme();
  return (
    <Switch
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor={isDark ? '#F5F5F5' : colors.surface}
      {...props}
    />
  );
}

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface ReportPdfButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function ReportPdfButton({ onPress, loading, disabled }: ReportPdfButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Download PDF"
      style={({ pressed }) => [
        styles.button,
        pressed && !inactive ? { opacity: 0.65 } : null,
        inactive ? { opacity: 0.35 } : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="download-outline" size={22} color={colors.primary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
});

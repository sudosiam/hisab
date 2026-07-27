import React from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { HeaderIconButton } from './HeaderIconButton';

interface ReportPdfButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function ReportPdfButton({ onPress, loading, disabled }: ReportPdfButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  return (
    <HeaderIconButton
      name="download-outline"
      tintColor={colors.headerText}
      onPress={onPress}
      accessibilityLabel="Download PDF"
      trailing
      disabled={inactive}
    >
      {loading ? <ActivityIndicator size="small" color={colors.headerText} /> : undefined}
    </HeaderIconButton>
  );
}

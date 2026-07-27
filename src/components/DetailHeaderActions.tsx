import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { CalculatorHeaderButton } from './QuickCalculator';
import { HeaderIconButton, headerIconRowStyle } from './HeaderIconButton';
import { OverflowMenu, type OverflowAction } from './OverflowMenu';

interface ShareHeaderButtonProps {
  onPress: () => void;
  tintColor: string;
  trailing?: boolean;
}

export function ShareHeaderButton({ onPress, tintColor, trailing = false }: ShareHeaderButtonProps) {
  return (
    <HeaderIconButton
      name="share-outline"
      tintColor={tintColor}
      onPress={onPress}
      accessibilityLabel="Share PDF"
      trailing={trailing}
    />
  );
}

interface DetailHeaderActionsProps {
  onShare: () => void;
  overflowActions: OverflowAction[];
  showCalculator?: boolean;
}

/** Share + calculator + overflow — trailing control carries header edge padding. */
export function DetailHeaderActions({
  onShare,
  overflowActions,
  showCalculator = true,
}: DetailHeaderActionsProps) {
  const { colors } = useTheme();

  return (
    <View style={headerIconRowStyle}>
      <ShareHeaderButton onPress={onShare} tintColor={colors.headerText} />
      {showCalculator ? (
        <CalculatorHeaderButton tintColor={colors.headerText} trailing={false} />
      ) : null}
      <OverflowMenu actions={overflowActions} trailing />
    </View>
  );
}

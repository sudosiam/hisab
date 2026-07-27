import React from 'react';
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HIT = 44;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface HeaderIconButtonProps {
  name: IconName;
  tintColor: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** Extra space after the trailing header control. */
  trailing?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Shared header action hit target — keeps share / overflow / calculator optically aligned. */
export function HeaderIconButton({
  name,
  tintColor,
  onPress,
  accessibilityLabel,
  trailing = false,
  disabled = false,
  style,
  children,
}: HeaderIconButtonProps) {
  return (
    <Pressable
      onPress={() => {
        void import('../utils/haptics').then((m) => m.hapticLight());
        onPress();
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ borderless: true, radius: HIT / 2 }}
      style={({ pressed }) => [
        styles.btn,
        trailing ? styles.trailing : null,
        pressed && !disabled ? { opacity: 0.75 } : null,
        disabled ? { opacity: 0.35 } : null,
        style,
      ]}
    >
      {children ?? <Ionicons name={name} size={22} color={tintColor} />}
    </Pressable>
  );
}

export const headerIconRowStyle = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
}).row;

const styles = StyleSheet.create({
  btn: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: {
    marginRight: Platform.OS === 'ios' ? 4 : 8,
  },
});

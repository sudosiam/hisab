import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../constants/theme';

export const NUMERIC_KEYBOARD_ACCESSORY_ID = 'hisab-numeric-done';

/** iOS decimal-pad has no Done key — attach this accessory to numeric money/qty fields. */
export function NumericKeyboardAccessory() {
  const { colors } = useTheme();
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={NUMERIC_KEYBOARD_ACCESSORY_ID}>
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Done"
          hitSlop={8}
        >
          <Text style={[styles.done, { color: colors.primary }]}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  done: {
    fontSize: 16,
    fontWeight: '600',
  },
});

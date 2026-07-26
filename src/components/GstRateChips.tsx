import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GST_RATES } from '../services/gst';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../constants/theme';

type Props = {
  value: string;
  onChange: (rate: string) => void;
  disabled?: boolean;
};

/** Quick-pick common GST rates; parent still owns free-text FormInput. */
export function GstRateChips({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();
  const current = value.trim();

  return (
    <View style={styles.row}>
      {GST_RATES.map((rate) => {
        const label = String(rate);
        const active = current === label || (rate === 0 && (current === '' || current === '0'));
        return (
          <Pressable
            key={label}
            disabled={disabled}
            onPress={() => onChange(rate === 0 ? '0' : label)}
            style={[
              styles.chip,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.chipActive : colors.chip,
                borderRadius: radius.sm,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? colors.chipTextActive : colors.chipText },
              ]}
            >
              {rate}%
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

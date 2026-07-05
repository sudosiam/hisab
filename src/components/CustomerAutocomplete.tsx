import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { searchCustomers, searchVendors } from '../services/customers';
import type { PartyType } from '../types';

interface Props {
  label?: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  partyType?: PartyType;
  searchFn?: (query: string) => Promise<string[]>;
}

export function CustomerAutocomplete({
  label = 'Customer',
  value,
  onChange,
  placeholder = 'Start typing customer name',
  partyType = 'customer',
  searchFn,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  const resolveSearch =
    searchFn ?? (partyType === 'vendor' ? searchVendors : searchCustomers);

  useEffect(() => {
    let active = true;
    resolveSearch(value).then((names) => {
      if (active) setSuggestions(names);
    });
    return () => {
      active = false;
    };
  }, [value, resolveSearch]);

  const filtered = suggestions.filter(
    (n) => !value.trim() || n.toLowerCase().includes(value.trim().toLowerCase())
  );
  const showCreate =
    value.trim().length > 0 &&
    !filtered.some((n) => n.toLowerCase() === value.trim().toLowerCase());
  const partyLabel = partyType === 'vendor' ? 'vendor' : 'customer';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && (filtered.length > 0 || showCreate) ? (
        <View style={styles.dropdown}>
          {showCreate ? (
            <TouchableOpacity
              style={styles.suggestion}
              onPressIn={() => onChange(value.trim())}
            >
              <Text style={styles.createText}>
                Create new {partyLabel}: &ldquo;{value.trim()}&rdquo;
              </Text>
            </TouchableOpacity>
          ) : null}
          {filtered.slice(0, 8).map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.suggestion}
              onPress={() => onChange(item)}
            >
              <Text style={styles.suggestionText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.md, zIndex: 10 },
    label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 13,
      backgroundColor: colors.inputBg,
      fontSize: 15,
      color: colors.text,
    },
    dropdown: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      maxHeight: 200,
      overflow: 'hidden',
    },
    suggestion: { paddingHorizontal: spacing.md, paddingVertical: 12 },
    suggestionText: { fontSize: 14, color: colors.text },
    createText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  });
}

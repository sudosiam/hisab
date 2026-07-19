import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useDatabase } from '../context/DatabaseContext';
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
  const { refreshKey } = useDatabase();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [searchTick, setSearchTick] = useState(0);

  const resolveSearch =
    searchFn ?? (partyType === 'vendor' ? searchVendors : searchCustomers);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      resolveSearch(value)
        .then((names) => {
          if (active) setSuggestions(names);
        })
        .catch(() => {
          if (active) setSuggestions([]);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value, resolveSearch, refreshKey, searchTick]);

  const filtered = suggestions.filter(
    (n) => !value.trim() || n.toLowerCase().includes(value.trim().toLowerCase())
  );
  const showCreate =
    value.trim().length > 0 &&
    !filtered.some((n) => n.toLowerCase() === value.trim().toLowerCase());
  const partyLabel = partyType === 'vendor' ? 'vendor' : 'customer';
  const showDropdown = focused && (filtered.length > 0 || showCreate);

  const handleSelect = (name: string) => {
    onChange(name);
    setFocused(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onFocus={() => {
          setFocused(true);
          setSearchTick((tick) => tick + 1);
        }}
        accessibilityLabel={label}
      />
      <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setFocused(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFocused(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 280 }}>
              {showCreate ? (
                <TouchableOpacity
                  style={styles.suggestion}
                  onPress={() => handleSelect(value.trim())}
                  accessibilityRole="button"
                  accessibilityLabel={`Create new ${partyLabel} ${value.trim()}`}
                >
                  <Text style={styles.createText}>
                    Create new {partyLabel}: &ldquo;{value.trim()}&rdquo;
                  </Text>
                </TouchableOpacity>
              ) : null}
              {filtered.slice(0, 12).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.suggestion}
                  onPress={() => handleSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item}`}
                >
                  <Text style={styles.suggestionText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.md },
    label: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginBottom: 4 },
    input: {
      borderWidth: 0,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      minHeight: 44,
      backgroundColor: colors.inputBg,
      fontSize: 14,
      color: colors.text,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.md,
      borderWidth: 0,
    },
    modalTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    suggestion: { paddingVertical: 12, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
    suggestionText: { fontSize: 14, color: colors.text },
    createText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  });
}

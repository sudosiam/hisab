import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useDatabase } from '../context/DatabaseContext';
import { spacing, radius } from '../constants/theme';
import { elevatedSurface } from '../constants/shadows';
import { searchCustomers, searchVendors } from '../services/customers';
import { claimDropdownOpen, releaseDropdownOpen } from '../utils/dropdownOpen';
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
  const { colors, isDark } = useTheme();
  const { refreshKey } = useDatabase();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [searchTick, setSearchTick] = useState(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDropdown = useCallback(() => setFocused(false), []);

  const resolveSearch =
    searchFn ?? (partyType === 'vendor' ? searchVendors : searchCustomers);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearBlurTimer();
      releaseDropdownOpen(closeDropdown);
    };
  }, [clearBlurTimer, closeDropdown]);

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
    clearBlurTimer();
    onChange(name);
    setFocused(false);
    releaseDropdownOpen(closeDropdown);
  };

  return (
    <View style={[styles.wrap, showDropdown && styles.wrapOpen]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onFocus={() => {
          clearBlurTimer();
          claimDropdownOpen(closeDropdown);
          setFocused(true);
          setSearchTick((tick) => tick + 1);
        }}
        onBlur={() => {
          clearBlurTimer();
          blurTimerRef.current = setTimeout(() => {
            blurTimerRef.current = null;
            setFocused(false);
            releaseDropdownOpen(closeDropdown);
          }, 180);
        }}
        accessibilityLabel={label}
      />
      {showDropdown ? (
        <View style={styles.panel}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }} nestedScrollEnabled>
            {showCreate ? (
              <TouchableOpacity
                style={styles.suggestion}
                onPressIn={() => handleSelect(value.trim())}
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
                onPressIn={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${item}`}
              >
                <Text style={styles.suggestionText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.md, zIndex: 1 },
    wrapOpen: { zIndex: 40 },
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
    panel: {
      ...elevatedSurface(colors, isDark),
      marginTop: 4,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    suggestion: {
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    suggestionText: { fontSize: 14, color: colors.text },
    createText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  });
}

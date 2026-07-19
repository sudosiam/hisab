import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useDatabase } from '../context/DatabaseContext';
import { spacing, radius, typography } from '../constants/theme';
import { listPartyNames } from '../services/parties';
import type { PartyType } from '../types';

interface Props {
  partyType: PartyType;
  label?: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}

const PARTY_CONFIG: Record<
  PartyType,
  {
    defaultLabel: string;
    defaultPlaceholder: string;
    sheetTitle: string;
    searchPlaceholder: string;
    emptyHint: string;
    useLabel: string;
  }
> = {
  vendor: {
    defaultLabel: 'Vendor',
    defaultPlaceholder: 'Tap to select vendor',
    sheetTitle: 'Select Vendor',
    searchPlaceholder: 'Search vendors...',
    emptyHint: 'No vendors yet. Add purchases or create a vendor in Parties.',
    useLabel: 'vendor',
  },
  customer: {
    defaultLabel: 'Customer',
    defaultPlaceholder: 'Tap to select customer',
    sheetTitle: 'Select Customer',
    searchPlaceholder: 'Search customers...',
    emptyHint: 'No customers yet. Add sales or create a customer in Parties.',
    useLabel: 'customer',
  },
};

export function PartyPickerField({
  partyType,
  label,
  value,
  onChange,
  placeholder,
}: Props) {
  const config = PARTY_CONFIG[partyType];
  const { colors } = useTheme();
  const { refreshKey } = useDatabase();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fieldLabel = label ?? config.defaultLabel;
  const fieldPlaceholder = placeholder ?? config.defaultPlaceholder;

  const loadNames = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setNames(await listPartyNames(partyType));
    } catch (error) {
      setNames([]);
      setLoadError(error instanceof Error ? error.message : `Could not load ${config.useLabel}s.`);
    } finally {
      setLoading(false);
    }
  }, [partyType, config.useLabel]);

  useEffect(() => {
    void loadNames();
  }, [loadNames, refreshKey]);

  useEffect(() => {
    if (open) {
      void loadNames();
    }
  }, [open, loadNames]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names;
    return names.filter((name) => name.toLowerCase().includes(q));
  }, [names, query]);

  const showUseQuery =
    query.trim().length > 0 &&
    !filtered.some((name) => name.toLowerCase() === query.trim().toLowerCase());

  const openModal = () => {
    setQuery('');
    setOpen(true);
  };

  const selectName = (name: string) => {
    onChange(name.trim());
    setOpen(false);
  };

  return (
    <>
      <View style={styles.wrap}>
        <Text style={styles.label}>{fieldLabel}</Text>
        <TouchableOpacity
          style={styles.trigger}
          onPress={openModal}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={value ? `${fieldLabel} ${value}` : fieldPlaceholder}
        >
          <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
            {value || fieldPlaceholder}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.primary} />
        </TouchableOpacity>
        {value ? (
          <Text style={styles.selectedHint}>{names.length} {config.useLabel}s available</Text>
        ) : null}
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modalScreen} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.sheetTitle}>{config.sheetTitle}</Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={`Close ${config.useLabel} picker`}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={config.searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={config.searchPlaceholder}
            />
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.empty}>Loading {config.useLabel}s…</Text>
            </View>
          ) : loadError ? (
            <View style={styles.centered}>
              <Text style={styles.error}>{loadError}</Text>
              <TouchableOpacity onPress={() => void loadNames()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={filtered.length === 0 && !showUseQuery ? styles.listEmpty : undefined}
              ListHeaderComponent={
                showUseQuery ? (
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => selectName(query)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${config.useLabel} ${query.trim()}`}
                  >
                    <Text style={styles.useQueryText}>Use &ldquo;{query.trim()}&rdquo;</Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                !showUseQuery ? (
                  <View style={styles.centered}>
                    <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                    <Text style={styles.empty}>
                      {names.length === 0
                        ? config.emptyHint
                        : `No ${config.useLabel}s match your search.`}
                    </Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    item.toLowerCase() === value.trim().toLowerCase() && styles.optionActive,
                  ]}
                  onPress={() => selectName(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${config.useLabel} ${item}`}
                >
                  <Text style={styles.optionText}>{item}</Text>
                  {item.toLowerCase() === value.trim().toLowerCase() ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

export function VendorPickerField(props: Omit<Props, 'partyType'>) {
  return <PartyPickerField partyType="vendor" {...props} />;
}

export function CustomerPickerField(props: Omit<Props, 'partyType'>) {
  return <PartyPickerField partyType="customer" {...props} />;
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.md },
    label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 0,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      minHeight: 44,
      backgroundColor: colors.inputBg,
      gap: spacing.sm,
    },
    value: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' },
    placeholder: { color: colors.textMuted, fontWeight: '400' },
    selectedHint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
    modalScreen: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    closeBtn: { padding: spacing.xs },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: spacing.md,
      borderWidth: 0,
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      backgroundColor: colors.surfaceContainer,
      gap: spacing.sm,
    },
    search: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    list: { flex: 1 },
    listEmpty: { flexGrow: 1 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    optionActive: { backgroundColor: colors.navActive },
    optionText: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
    useQueryText: { fontSize: 15, color: colors.primary, fontWeight: '700' },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.sm,
    },
    empty: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
    retryBtn: { padding: spacing.sm },
    retryText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  });
}

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { addProductCategory, getProductCategories } from '../services/inventory';
import { formatSqliteError } from '../db/database';

interface Props {
  label?: string;
  value: string;
  onChange: (category: string) => void;
  /** Show an "all" option that clears the selection (for list filters). */
  allowAll?: boolean;
  allLabel?: string;
  placeholder?: string;
  /** Allow adding new categories from the picker. */
  allowAdd?: boolean;
}

export function CategoryPicker({
  label = 'Category',
  value,
  onChange,
  allowAll = false,
  allLabel = 'All categories',
  placeholder = 'Select category',
  allowAdd = true,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const loadCategories = useCallback(async () => {
    setCategories(await getProductCategories());
  }, []);

  const openPicker = async () => {
    setNewName('');
    await loadCategories();
    setOpen(true);
  };

  const handleAddCategory = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Enter a category name');
      return;
    }
    setAdding(true);
    try {
      await addProductCategory(trimmed);
      await loadCategories();
      onChange(trimmed);
      setNewName('');
      setOpen(false);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setAdding(false);
    }
  };

  const displayValue = !value ? (allowAll ? allLabel : placeholder) : value;
  const showPlaceholderStyle = !value && !allowAll;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.trigger} onPress={openPicker} activeOpacity={0.75}>
        <Text style={[styles.triggerText, showPlaceholderStyle && styles.placeholder]}>
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{allowAll ? 'Filter by Category' : 'Select Category'}</Text>

            {allowAdd ? (
              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="New category name"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={[styles.addBtn, adding && styles.addBtnDisabled]}
                  onPress={handleAddCategory}
                  disabled={adding}
                >
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <FlatList
              data={categories}
              keyExtractor={(item) => item}
              ListHeaderComponent={
                allowAll ? (
                  <TouchableOpacity
                    style={[styles.option, !value && styles.optionActive]}
                    onPress={() => {
                      onChange('');
                      setOpen(false);
                    }}
                  >
                    <Text style={styles.optionText}>{allLabel}</Text>
                    {!value ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                allowAdd ? (
                  <Text style={styles.empty}>No categories yet. Add one above.</Text>
                ) : (
                  <Text style={styles.empty}>No categories yet.</Text>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item === value && styles.optionActive]}
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item}</Text>
                  {item === value ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.sm },
    label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      backgroundColor: colors.inputBg,
    },
    triggerText: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
    placeholder: { color: colors.textMuted, fontWeight: '500' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      ...cardSurface(colors, isDark),
      maxHeight: '70%',
      padding: spacing.md,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    addRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
      alignItems: 'center',
    },
    addInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.inputBg,
    },
    addBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.md,
    },
    addBtnDisabled: { opacity: 0.6 },
    addBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 14 },
    empty: { textAlign: 'center', color: colors.textMuted, paddingVertical: spacing.md },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    optionActive: { backgroundColor: colors.navActive },
    optionText: { fontSize: 15, color: colors.text, fontWeight: '500' },
  });
}

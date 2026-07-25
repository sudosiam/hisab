import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  ErrorState,
  FormInput,
  FormScreen,
  PrimaryButton,
  SearchField,
  SectionHeader,
  useScreenStyles,
} from '../../src/components/ui';
import { MoneyText } from '../../src/components/MoneyText';
import {
  addFixedAsset,
  deleteFixedAsset,
  getFixedAssets,
  updateFixedAsset,
} from '../../src/services/banking';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../src/utils/format';
import { matchesSearch } from '../../src/utils/search';
import { useTheme } from '../../src/context/ThemeContext';
import { useDatabase } from '../../src/context/DatabaseContext';
import { formatSqliteError } from '../../src/db/database';
import { spacing, typography } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';
import type { FixedAsset } from '../../src/types';

export default function OthersScreen() {
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const { refresh } = useDatabase();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginBottom: spacing.lg,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textSecondary, textTransform: 'uppercase' },
        heroValueWrap: { width: '100%', marginTop: spacing.sm, paddingHorizontal: spacing.sm },
        assetCard: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.xs + 2,
          minHeight: 52,
          overflow: 'visible',
        },
        assetName: { fontSize: 14, fontWeight: '600', color: colors.text },
        amountCol: { flexShrink: 1, minWidth: 88, maxWidth: '48%', alignItems: 'flex-end' },
        assetMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
        actionTap: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          minHeight: 40,
          justifyContent: 'center',
        },
        form: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.lg,
        },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await getFixedAssets());
      setError(null);
    } catch (e) {
      setError(formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const formOpenRef = useRef(false);
  formOpenRef.current = showAdd;

  useFocusEffect(useCallback(() => {
    // Don't reload over an open add/edit form.
    if (formOpenRef.current) return;
    load();
  }, [load]));

  const total = assets.reduce((sum, a) => sum + a.value, 0);

  const filteredAssets = useMemo(
    () => assets.filter((item) => matchesSearch(search, [item.name, item.notes, item.value])),
    [assets, search]
  );

  const resetForm = () => {
    setName('');
    setValue('');
    setNotes('');
    setEditingId(null);
    setShowAdd(false);
  };

  const handleSave = async () => {
    if (saving) return;
    const val = parsePositiveAmount(value);
    if (!name.trim() || val === null) {
      Alert.alert('Error', 'Enter asset name and a value greater than zero');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateFixedAsset(editingId, { name: name.trim(), value: val, notes: notes.trim() || undefined });
      } else {
        await addFixedAsset({ name: name.trim(), value: val, notes: notes.trim() || undefined });
      }
      refresh();
      resetForm();
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (asset: FixedAsset) => {
    setEditingId(asset.id);
    setName(asset.name);
    setValue(formatAmountInput(asset.value));
    setNotes(asset.notes ?? '');
    setShowAdd(true);
  };

  const handleDelete = (asset: FixedAsset) => {
    Alert.alert('Delete Asset', `Remove ${asset.name}?\nThis removes ${formatCurrency(asset.value)} from fixed assets on the balance sheet.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFixedAsset(asset.id);
            refresh();
            await load();
          } catch (e) {
            Alert.alert('Error', formatSqliteError(e));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <FormScreen>
      <View style={localStyles.hero}>
        <Text style={localStyles.heroLabel}>Fixed Assets Total</Text>
        <View style={localStyles.heroValueWrap}>
          <MoneyText amount={total} size="hero" style={{ width: '100%', textAlign: 'center' }} />
        </View>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13 }}>
          {assets.length} asset{assets.length === 1 ? '' : 's'} · shown on Balance Sheet
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHeader title="Fixed Assets" />
        <TouchableOpacity
          onPress={() => {
            if (showAdd) {
              resetForm();
              return;
            }
            resetForm();
            setShowAdd(true);
          }}
        >
          <Text style={styles.link}>{showAdd ? 'Cancel' : '+ Add Asset'}</Text>
        </TouchableOpacity>
      </View>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search asset name or notes..."
      />

      {showAdd ? (
        <View style={localStyles.form}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit Asset' : 'New Asset'}</Text>
          <FormInput label="Asset Name" value={name} onChangeText={setName} placeholder="Vehicle, Equipment..." />
          <FormInput label="Value (₹)" value={value} onChangeText={setValue} money />
          <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Details, purchase date..." />
          <PrimaryButton title={editingId ? 'Save Changes' : 'Add Asset'} onPress={handleSave} loading={saving} />
        </View>
      ) : null}

      {filteredAssets.length === 0 ? (
        <Text style={styles.empty}>
          {search.trim() ? 'No assets match your search.' : 'No fixed assets yet. Add vehicles, equipment, property, etc.'}
        </Text>
      ) : (
        filteredAssets.map((asset) => (
          <TouchableOpacity
            key={asset.id}
            style={localStyles.assetCard}
            onPress={() => startEdit(asset)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Edit asset ${asset.name}`}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={localStyles.assetName} numberOfLines={2}>
                  {asset.name}
                </Text>
                {asset.notes ? (
                  <Text style={localStyles.assetMeta} numberOfLines={2}>
                    {asset.notes}
                  </Text>
                ) : null}
                <Text style={localStyles.assetMeta}>Added {asset.created_at.slice(0, 10)}</Text>
              </View>
              <View style={localStyles.amountCol}>
                <MoneyText
                  amount={asset.value}
                  size="md"
                  color={colors.primary}
                  style={{ width: '100%' }}
                />
              </View>
            </View>
            <View style={localStyles.actions}>
              <TouchableOpacity
                style={localStyles.actionTap}
                onPress={() => startEdit(asset)}
                accessibilityRole="button"
                accessibilityLabel={`Edit asset ${asset.name}`}
              >
                <Text style={styles.link}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={localStyles.actionTap}
                onPress={() => handleDelete(asset)}
                accessibilityRole="button"
                accessibilityLabel={`Delete asset ${asset.name}`}
              >
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))
      )}
    </FormScreen>
  );
}

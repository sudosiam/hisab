import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FormInput, PrimaryButton, SearchField, SectionHeader, useScreenStyles } from '../../src/components/ui';
import {
  addFixedAsset,
  deleteFixedAsset,
  getFixedAssets,
  updateFixedAsset,
} from '../../src/services/banking';
import { formatCurrency } from '../../src/utils/format';
import { matchesSearch } from '../../src/utils/search';
import { useTheme } from '../../src/context/ThemeContext';
import { useDatabase } from '../../src/context/DatabaseContext';
import { formatSqliteError } from '../../src/db/database';
import { spacing, radius, typography } from '../../src/constants/theme';
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

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...cardSurface(colors, isDark),
          padding: spacing.lg,
          marginBottom: spacing.lg,
          alignItems: 'center',
        },
        heroLabel: { ...typography.section, color: colors.textMuted, textTransform: 'uppercase' },
        heroValue: { ...typography.display, color: colors.primary, marginTop: spacing.sm },
        assetCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        assetName: { fontSize: 16, fontWeight: '700', color: colors.text },
        assetValue: { fontSize: 18, fontWeight: '700', color: colors.primary, marginTop: spacing.xs },
        assetMeta: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
        actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
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
    setAssets(await getFixedAssets());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
    const val = parseFloat(value);
    if (!name.trim() || !val) {
      Alert.alert('Error', 'Enter asset name and value');
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
    setValue(String(asset.value));
    setNotes(asset.notes ?? '');
    setShowAdd(true);
  };

  const handleDelete = (asset: FixedAsset) => {
    Alert.alert('Delete Asset', `Remove ${asset.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFixedAsset(asset.id);
          refresh();
          await load();
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.hero}>
        <Text style={localStyles.heroLabel}>Fixed Assets Total</Text>
        <Text style={localStyles.heroValue}>{formatCurrency(total)}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13 }}>
          {assets.length} asset{assets.length === 1 ? '' : 's'} · shown on Balance Sheet
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHeader title="Fixed Assets" />
        <TouchableOpacity onPress={() => { resetForm(); setShowAdd(!showAdd); }}>
          <Text style={styles.link}>{showAdd && !editingId ? 'Cancel' : '+ Add Asset'}</Text>
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
          <FormInput label="Value (₹)" value={value} onChangeText={setValue} keyboardType="decimal-pad" />
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
          <View key={asset.id} style={localStyles.assetCard}>
            <Text style={localStyles.assetName}>{asset.name}</Text>
            <Text style={localStyles.assetValue}>{formatCurrency(asset.value)}</Text>
            {asset.notes ? <Text style={localStyles.assetMeta}>{asset.notes}</Text> : null}
            <Text style={localStyles.assetMeta}>Added {asset.created_at.slice(0, 10)}</Text>
            <View style={localStyles.actions}>
              <TouchableOpacity onPress={() => startEdit(asset)}>
                <Text style={styles.link}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(asset)}>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

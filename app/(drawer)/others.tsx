import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EmptyState,
  ErrorState,
  Fab,
  FormInput,
  PrimaryButton,
  SearchField,
  SectionHeader,
  SummaryHero,
  ThemedPressable,
  useFabListPadding,
  useScreenStyles,
} from '../../src/components/ui';
import { ListItem } from '../../src/components/ListItem';
import { ListSkeleton } from '../../src/components/Skeleton';
import {
  addFixedAsset,
  deleteFixedAsset,
  getFixedAssets,
  updateFixedAsset,
} from '../../src/services/banking';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../src/utils/format';
import { matchesSearch } from '../../src/utils/search';
import { useTheme } from '../../src/context/ThemeContext';
import { useDatabaseActions } from '../../src/context/DatabaseContext';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../src/db/database';
import { spacing } from '../../src/constants/theme';
import { FLATLIST_PERF, listCardGetItemLayout } from '../../src/constants/listPerf';
import { cardSurface } from '../../src/constants/shadows';
import type { FixedAsset } from '../../src/types';

type FieldErrors = {
  name?: string;
  value?: string;
};

export default function OthersScreen() {
  const styles = useScreenStyles();
  const insets = useSafeAreaInsets();
  const fabListPadding = useFabListPadding();
  const { colors, isDark } = useTheme();
  const { refresh } = useDatabaseActions();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const savedFormSnapshotRef = useRef<string | null>(null);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        editingId,
        name,
        value,
        notes,
      }),
    [editingId, name, value, notes]
  );
  const formDirty =
    showAdd &&
    savedFormSnapshotRef.current !== null &&
    formSnapshot !== savedFormSnapshotRef.current;
  useUnsavedChangesGuard(formDirty);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        form: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.lg,
          gap: spacing.xs,
        },
        actionTap: {
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
          minHeight: 44,
          minWidth: 64,
          justifyContent: 'center',
          alignItems: 'flex-end',
        },
        headerRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
          marginBottom: spacing.xs,
        },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    setAssets(await getFixedAssets());
    setError(null);
  }, []);

  const formOpenRef = useRef(false);
  formOpenRef.current = showAdd;

  const { booting, error: loadError, retry } = useFocusRefresh(async () => {
    if (!formOpenRef.current) await load();
  }, []);

  const total = useMemo(() => assets.reduce((sum, a) => sum + a.value, 0), [assets]);

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
    setFieldErrors({});
    savedFormSnapshotRef.current = null;
  };

  const startAdd = () => {
    const blank = { editingId: null as number | null, name: '', value: '', notes: '' };
    setEditingId(blank.editingId);
    setName(blank.name);
    setValue(blank.value);
    setNotes(blank.notes);
    setShowAdd(true);
    savedFormSnapshotRef.current = JSON.stringify(blank);
  };

  const startEdit = (asset: FixedAsset) => {
    const next = {
      editingId: asset.id as number | null,
      name: asset.name,
      value: formatAmountInput(asset.value),
      notes: asset.notes ?? '',
    };
    setEditingId(next.editingId);
    setName(next.name);
    setValue(next.value);
    setNotes(next.notes);
    setShowAdd(true);
    savedFormSnapshotRef.current = JSON.stringify(next);
  };

  const handleSave = async () => {
    if (saving) return;
    const nextErrors: FieldErrors = {};
    const parsed = parsePositiveAmount(value);
    if (!name.trim()) nextErrors.name = 'Enter asset name';
    if (parsed === null) nextErrors.value = 'Enter an amount greater than zero';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        value: parsed!,
        notes: notes.trim() || undefined,
      };
      if (editingId) {
        await updateFixedAsset(editingId, payload);
      } else {
        await addFixedAsset(payload);
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

  const handleDelete = useCallback(
    (asset: FixedAsset) => {
      Alert.alert(
        'Delete Asset',
        `Remove ${asset.name}?\nThis removes ${formatCurrency(asset.value)} from the balance sheet.`,
        [
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
        ]
      );
    },
    [load, refresh]
  );

  const renderAssetItem = useCallback(
    ({ item: asset }: { item: FixedAsset }) => (
      <ListItem
        title={asset.name}
        subtitle={`Value ${formatCurrency(asset.value)} · Added ${asset.created_at.slice(0, 10)}`}
        meta={asset.notes ?? undefined}
        amount={asset.value}
        amountColor={colors.primary}
        onPress={() => startEdit(asset)}
        trailing={
          <ThemedPressable
            style={localStyles.actionTap}
            onPress={() => handleDelete(asset)}
            haptic="warning"
            accessibilityRole="button"
            accessibilityLabel={`Delete asset ${asset.name}`}
            hitSlop={6}
          >
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Delete</Text>
          </ThemedPressable>
        }
        accessibilityLabel={`Edit asset ${asset.name}`}
      />
    ),
    [colors.danger, colors.primary, handleDelete, localStyles.actionTap]
  );

  const listHeader = (
    <>
      <SummaryHero
        label="Fixed Assets Total"
        amount={total}
        hint={`${assets.length} asset${assets.length === 1 ? '' : 's'} · balance-sheet memos (no depreciation)`}
      />

      <View style={localStyles.headerRow}>
        <SectionHeader title="Fixed Assets" />
        {showAdd ? (
          <ThemedPressable
            onPress={resetForm}
            accessibilityRole="button"
            accessibilityLabel="Cancel asset form"
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}
          >
            <Text style={styles.link}>Cancel</Text>
          </ThemedPressable>
        ) : null}
      </View>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search asset name or notes..."
      />

      {showAdd ? (
        <View style={localStyles.form}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit Asset' : 'New Asset'}</Text>
          <FormInput
            label="Asset Name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
            }}
            placeholder="Vehicle, Equipment..."
            error={fieldErrors.name}
          />
          <FormInput
            label="Value (₹)"
            value={value}
            onChangeText={(v) => {
              setValue(v);
              if (fieldErrors.value) setFieldErrors((e) => ({ ...e, value: undefined }));
            }}
            money
            error={fieldErrors.value}
          />
          <FormInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Details, purchase date..."
          />
          <PrimaryButton
            title={editingId ? 'Save Changes' : 'Add Asset'}
            onPress={handleSave}
            loading={saving}
          />
        </View>
      ) : null}
    </>
  );

  if (booting && assets.length === 0) {
    return (
      <View style={styles.container}>
        <ListSkeleton />
      </View>
    );
  }

  if (error || loadError) {
    return <ErrorState message={error ?? loadError ?? undefined} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: fabListPadding + Math.max(insets.bottom, spacing.md) },
        ]}
        data={filteredAssets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderAssetItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        getItemLayout={listCardGetItemLayout}
        {...FLATLIST_PERF}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load()
                .catch((e) => Alert.alert('Refresh failed', formatSqliteError(e)))
                .finally(() => setRefreshing(false));
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            title={search.trim() ? 'No matching assets' : 'No fixed assets yet'}
            message={
              search.trim()
                ? 'Try a different search.'
                : 'Add vehicles, equipment, property, and other assets.'
            }
            actionLabel={search.trim() ? undefined : 'Add Asset'}
            onAction={search.trim() ? undefined : startAdd}
          />
        }
      />
      {!showAdd ? <Fab label="+ Add Asset" onPress={startAdd} /> : null}
    </View>
  );
}

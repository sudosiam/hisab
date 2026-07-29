import React, { useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { FormInput, FormScreen, PrimaryButton } from '../../../src/components/ui';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { createProduct } from '../../../src/services/inventory';
import { DRAFT_KEYS, loadDraft, type InventoryFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../../src/db/database';
import { parseAmountInput, parseMoneyInput } from '../../../src/utils/format';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';

function isInventoryDraftEmpty(d: InventoryFormDraft): boolean {
  return (
    !d.name.trim() &&
    !d.category.trim() &&
    !d.sku.trim() &&
    !d.sellPrice.trim() &&
    (d.unit.trim() === 'pcs' || !d.unit.trim()) &&
    (!d.openingQty.trim() || d.openingQty === '0') &&
    (!d.openingCost.trim() || d.openingCost === '0')
  );
}

export default function NewProductScreen() {
  const router = useRouter();
  const { refresh } = useDatabaseActions();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [openingQty, setOpeningQty] = useState('0');
  const [openingCost, setOpeningCost] = useState('0');
  const [sellPrice, setSellPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const leaveBypassRef = useRef(false);

  const draftPayload = useMemo<InventoryFormDraft>(
    () => ({
      name,
      category,
      sku,
      unit,
      openingQty,
      openingCost,
      sellPrice,
    }),
    [name, category, sku, unit, openingQty, openingCost, sellPrice]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.inventoryNew,
    draftPayload,
    { isEmpty: isInventoryDraftEmpty }
  );

  useUnsavedChangesGuard(!isInventoryDraftEmpty(draftPayload) || hasDraft, {
    bypassRef: leaveBypassRef,
    message: 'You have an unsaved product draft that will be lost.',
  });

  const resetForm = () => {
    setName('');
    setCategory('');
    setSku('');
    setUnit('pcs');
    setOpeningQty('0');
    setOpeningCost('0');
    setSellPrice('');
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved product will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          resetForm();
        },
      },
    ]);
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraft<InventoryFormDraft>(DRAFT_KEYS.inventoryNew);
        if (cancelled) return;
        if (draft && !isInventoryDraftEmpty(draft)) {
          setName(draft.name || '');
          setCategory(draft.category || '');
          setSku(draft.sku || '');
          setUnit(draft.unit || 'pcs');
          setOpeningQty(draft.openingQty ?? '0');
          setOpeningCost(draft.openingCost ?? '0');
          setSellPrice(draft.sellPrice || '');
          noteDraftLoaded();
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      } finally {
        if (!cancelled) markReady();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markReady, noteDraftLoaded]);

  const handleSave = async () => {
    if (loading) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }
    if (!category.trim()) {
      Alert.alert('Error', 'Select or add a category');
      return;
    }
    const qty = openingQty.trim() ? parseAmountInput(openingQty) : 0;
    const cost = openingCost.trim() ? parseMoneyInput(openingCost) : 0;
    const price = sellPrice.trim() ? parseMoneyInput(sellPrice) : undefined;
    if (!Number.isFinite(qty) || qty < 0) {
      Alert.alert('Error', 'Opening stock quantity cannot be negative');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      Alert.alert('Error', 'Opening cost cannot be negative');
      return;
    }
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      Alert.alert('Error', 'Enter a valid sell price');
      return;
    }
    setLoading(true);
    try {
      const id = await createProduct({
        name: name.trim(),
        category: category.trim(),
        sku: sku.trim() || undefined,
        unit: unit.trim() || 'pcs',
        opening_qty: qty,
        opening_cost: cost,
        sell_price: price,
      });
      leaveBypassRef.current = true;
      await clearDraftOnSave();
      refresh();
      router.replace(`/(drawer)/inventory/${id}`);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen
      stickyFooter={<DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />}
    >
      <FormInput label="Product Name" value={name} onChangeText={setName} />
      <CategoryPicker value={category} onChange={setCategory} />
      <FormInput label="SKU (optional)" value={sku} onChangeText={setSku} />
      <FormInput label="Unit" value={unit} onChangeText={setUnit} placeholder="pcs, kg, box..." />
      <FormInput label="Opening Stock Qty" value={openingQty} onChangeText={setOpeningQty} qty />
      <FormInput label="Opening Cost (per unit)" value={openingCost} onChangeText={setOpeningCost} money />
      <FormInput
        label="Sell Price (per unit)"
        value={sellPrice}
        onChangeText={setSellPrice}
        money
        placeholder="Leave blank for cost + 20%"
      />
      <PrimaryButton title="Save Product" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

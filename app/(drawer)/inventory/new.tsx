import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { FormInput, FormScreen, PrimaryButton } from '../../../src/components/ui';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { createProduct } from '../../../src/services/inventory';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';

export default function NewProductScreen() {
  const router = useRouter();
  const { refresh } = useDatabase();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [openingQty, setOpeningQty] = useState('0');
  const [openingCost, setOpeningCost] = useState('0');
  const [sellPrice, setSellPrice] = useState('');
  const [loading, setLoading] = useState(false);

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
    const qty = openingQty.trim() ? parseFloat(openingQty) : 0;
    const cost = openingCost.trim() ? parseFloat(openingCost) : 0;
    const price = sellPrice.trim() ? parseFloat(sellPrice) : undefined;
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
      refresh();
      router.replace(`/(drawer)/inventory/${id}`);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen>
      <FormInput label="Product Name" value={name} onChangeText={setName} />
      <CategoryPicker value={category} onChange={setCategory} />
      <FormInput label="SKU (optional)" value={sku} onChangeText={setSku} />
      <FormInput label="Unit" value={unit} onChangeText={setUnit} placeholder="pcs, kg, box..." />
      <FormInput label="Opening Stock Qty" value={openingQty} onChangeText={setOpeningQty} keyboardType="decimal-pad" />
      <FormInput label="Opening Cost (per unit)" value={openingCost} onChangeText={setOpeningCost} keyboardType="decimal-pad" />
      <FormInput
        label="Sell Price (per unit)"
        value={sellPrice}
        onChangeText={setSellPrice}
        keyboardType="decimal-pad"
        placeholder="Leave blank for cost + 20%"
      />
      <PrimaryButton title="Save Product" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}

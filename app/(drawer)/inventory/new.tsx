import React, { useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { FormInput, PrimaryButton, useScreenStyles } from '../../../src/components/ui';
import { createProduct } from '../../../src/services/inventory';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';

export default function NewProductScreen() {
  const router = useRouter();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [openingQty, setOpeningQty] = useState('0');
  const [openingCost, setOpeningCost] = useState('0');
  const [sellPrice, setSellPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }
    setLoading(true);
    try {
      const id = await createProduct({
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit: unit.trim() || 'pcs',
        opening_qty: parseFloat(openingQty) || 0,
        opening_cost: parseFloat(openingCost) || 0,
        sell_price: sellPrice.trim() ? parseFloat(sellPrice) || 0 : undefined,
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <FormInput label="Product Name" value={name} onChangeText={setName} />
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
    </ScrollView>
  );
}

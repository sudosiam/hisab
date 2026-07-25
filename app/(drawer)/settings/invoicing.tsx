import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FormInput, useScreenStyles } from '../../../src/components/ui';
import { formatSqliteError } from '../../../src/db/database';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { useTheme } from '../../../src/context/ThemeContext';
import {
  getSaleInvoicePrefix,
  setSaleInvoicePrefix,
  getBosInvoicePrefix,
  setBosInvoicePrefix,
  getPurchaseInvoicePrefix,
  setPurchaseInvoicePrefix,
} from '../../../src/services/appSettings';
import {
  previewNextInvoiceFromSetting,
  getNextSaleInvoiceNo,
  getNextBosInvoiceNo,
  getNextPurchaseInvoiceNo,
} from '../../../src/services/invoiceNumbers';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';

export default function InvoicingSettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();

  const [salePrefix, setSalePrefix] = useState('S');
  const [bosPrefix, setBosPrefix] = useState('BOS');
  const [purchasePrefix, setPurchasePrefix] = useState('P');
  const [savedSalePrefix, setSavedSalePrefix] = useState('S');
  const [savedBosPrefix, setSavedBosPrefix] = useState('BOS');
  const [savedPurchasePrefix, setSavedPurchasePrefix] = useState('P');
  const [nextSaleInvoice, setNextSaleInvoice] = useState('');
  const [nextBosInvoice, setNextBosInvoice] = useState('');
  const [nextPurchaseInvoice, setNextPurchaseInvoice] = useState('');

  const prefixesDirty =
    salePrefix !== savedSalePrefix ||
    bosPrefix !== savedBosPrefix ||
    purchasePrefix !== savedPurchasePrefix;
  useUnsavedChangesGuard(prefixesDirty, {
    title: 'Discard settings?',
    message: 'You have unsaved invoice numbering changes.',
  });

  const load = useCallback(async () => {
    try {
      const sale = await getSaleInvoicePrefix();
      const bos = await getBosInvoicePrefix();
      const purchase = await getPurchaseInvoicePrefix();
      setSalePrefix(sale);
      setBosPrefix(bos);
      setPurchasePrefix(purchase);
      setSavedSalePrefix(sale);
      setSavedBosPrefix(bos);
      setSavedPurchasePrefix(purchase);
      setNextSaleInvoice(await getNextSaleInvoiceNo());
      setNextBosInvoice(await getNextBosInvoiceNo());
      setNextPurchaseInvoice(await getNextPurchaseInvoiceNo());
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveSalePrefix = async () => {
    try {
      await setSaleInvoicePrefix(salePrefix);
      const saved = await getSaleInvoicePrefix();
      setSalePrefix(saved);
      setSavedSalePrefix(saved);
      setNextSaleInvoice(await getNextSaleInvoiceNo());
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save sale numbering');
      setSalePrefix(await getSaleInvoicePrefix());
    }
  };

  const saveBosPrefix = async () => {
    try {
      await setBosInvoicePrefix(bosPrefix);
      const saved = await getBosInvoicePrefix();
      setBosPrefix(saved);
      setSavedBosPrefix(saved);
      setNextBosInvoice(await getNextBosInvoiceNo());
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save BOS numbering');
      setBosPrefix(await getBosInvoicePrefix());
    }
  };

  const savePurchasePrefix = async () => {
    try {
      await setPurchaseInvoicePrefix(purchasePrefix);
      const saved = await getPurchaseInvoicePrefix();
      setPurchasePrefix(saved);
      setSavedPurchasePrefix(saved);
      setNextPurchaseInvoice(await getNextPurchaseInvoiceNo());
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save purchase numbering');
      setPurchasePrefix(await getPurchaseInvoicePrefix());
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.sectionCard}>
        <Text style={localStyles.rowMeta}>
          Set the invoice number your next sale or purchase should use. Useful when moving from
          another system — not starting from 0001.
        </Text>
        <FormInput
          label="Next sale invoice number"
          value={salePrefix}
          onChangeText={setSalePrefix}
          placeholder="BPH2627-0003"
          onEndEditing={saveSalePrefix}
        />
        <Text style={localStyles.rowMeta}>
          After save, next sale: {previewNextInvoiceFromSetting(salePrefix, 'S')}
          {nextSaleInvoice &&
          nextSaleInvoice !== previewNextInvoiceFromSetting(salePrefix, 'S')
            ? ` (with existing sales: ${nextSaleInvoice})`
            : ''}
        </Text>
        <SettingsDivider color={colors.borderLight} />
        <FormInput
          label="Next BOS number"
          value={bosPrefix}
          onChangeText={setBosPrefix}
          placeholder="BOS2627-0001"
          onEndEditing={saveBosPrefix}
        />
        <Text style={localStyles.rowMeta}>
          After save, next BOS: {previewNextInvoiceFromSetting(bosPrefix, 'BOS')}
          {nextBosInvoice &&
          nextBosInvoice !== previewNextInvoiceFromSetting(bosPrefix, 'BOS')
            ? ` (with existing BOS: ${nextBosInvoice})`
            : ''}
        </Text>
        <SettingsDivider color={colors.borderLight} />
        <FormInput
          label="Next purchase invoice number"
          value={purchasePrefix}
          onChangeText={setPurchasePrefix}
          placeholder="GHP2728-000000013"
          onEndEditing={savePurchasePrefix}
        />
        <Text style={localStyles.rowMeta}>
          After save, next purchase: {previewNextInvoiceFromSetting(purchasePrefix, 'P')}
          {nextPurchaseInvoice &&
          nextPurchaseInvoice !== previewNextInvoiceFromSetting(purchasePrefix, 'P')
            ? ` (with existing purchases: ${nextPurchaseInvoice})`
            : ''}
        </Text>
      </View>
    </ScrollView>
  );
}

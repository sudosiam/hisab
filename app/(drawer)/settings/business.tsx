import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, Switch, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FormInput, useScreenStyles } from '../../../src/components/ui';
import { formatSqliteError } from '../../../src/db/database';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { useTheme } from '../../../src/context/ThemeContext';
import {
  getBusinessProfile,
  getBusinessState,
  setBusinessName,
  setBusinessAddress,
  setBusinessGstin,
  setBusinessState,
  setGstEnabled,
  setTaxInclusivePricing,
  setBusinessUpiId,
  setWhatsappMessageTemplate,
} from '../../../src/services/appSettings';
import { stateName } from '../../../src/services/gst';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';

export default function BusinessSettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();

  const [businessName, setBusinessNameState] = useState('');
  const [businessAddress, setBusinessAddressState] = useState('');
  const [businessGstin, setBusinessGstinState] = useState('');
  const [businessState, setBusinessStateState] = useState('');
  const [gstEnabled, setGstEnabledState] = useState(true);
  const [taxInclusive, setTaxInclusiveState] = useState(false);
  const [businessUpi, setBusinessUpiState] = useState('');
  const [whatsappTemplate, setWhatsappTemplateState] = useState('');
  const [savedBusinessName, setSavedBusinessName] = useState('');
  const [savedBusinessAddress, setSavedBusinessAddress] = useState('');
  const [savedBusinessGstin, setSavedBusinessGstin] = useState('');
  const [savedBusinessState, setSavedBusinessState] = useState('');
  const [savedBusinessUpi, setSavedBusinessUpi] = useState('');
  const [savedWhatsappTemplate, setSavedWhatsappTemplate] = useState('');

  const profileDirty =
    businessName !== savedBusinessName ||
    businessAddress !== savedBusinessAddress ||
    businessGstin !== savedBusinessGstin ||
    businessState !== savedBusinessState ||
    businessUpi !== savedBusinessUpi ||
    whatsappTemplate !== savedWhatsappTemplate;
  useUnsavedChangesGuard(profileDirty, {
    title: 'Discard settings?',
    message: 'You have unsaved business profile changes.',
  });

  const load = useCallback(async () => {
    try {
      const profile = await getBusinessProfile();
      setBusinessNameState(profile.business_name);
      setBusinessAddressState(profile.business_address);
      setBusinessGstinState(profile.business_gstin);
      setBusinessStateState(profile.business_state);
      setGstEnabledState(profile.gst_enabled);
      setTaxInclusiveState(profile.tax_inclusive);
      setBusinessUpiState(profile.business_upi_id);
      setWhatsappTemplateState(profile.whatsapp_message_template);
      setSavedBusinessName(profile.business_name);
      setSavedBusinessAddress(profile.business_address);
      setSavedBusinessGstin(profile.business_gstin);
      setSavedBusinessState(profile.business_state);
      setSavedBusinessUpi(profile.business_upi_id);
      setSavedWhatsappTemplate(profile.whatsapp_message_template);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveBusinessNameField = async () => {
    try {
      await setBusinessName(businessName);
      setSavedBusinessName(businessName.trim().slice(0, 120));
      setBusinessNameState(businessName.trim().slice(0, 120));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save business name');
    }
  };

  const saveBusinessAddressField = async () => {
    try {
      await setBusinessAddress(businessAddress);
      setSavedBusinessAddress(businessAddress.trim().slice(0, 500));
      setBusinessAddressState(businessAddress.trim().slice(0, 500));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save address');
    }
  };

  const saveBusinessGstinField = async () => {
    try {
      await setBusinessGstin(businessGstin);
      const cleaned = businessGstin.trim().toUpperCase().slice(0, 15);
      setBusinessGstinState(cleaned);
      setSavedBusinessGstin(cleaned);
      const syncedState = await getBusinessState();
      setBusinessStateState(syncedState);
      setSavedBusinessState(syncedState);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save GSTIN');
    }
  };

  const saveBusinessStateField = async () => {
    try {
      await setBusinessState(businessState);
      const cleaned = businessState.trim().slice(0, 2);
      setBusinessStateState(cleaned);
      setSavedBusinessState(cleaned);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save state');
    }
  };

  const toggleGstEnabled = async (value: boolean) => {
    try {
      setGstEnabledState(value);
      await setGstEnabled(value);
    } catch (e) {
      setGstEnabledState(!value);
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save GST setting');
    }
  };

  const toggleTaxInclusive = async (value: boolean) => {
    try {
      setTaxInclusiveState(value);
      await setTaxInclusivePricing(value);
    } catch (e) {
      setTaxInclusiveState(!value);
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save pricing mode');
    }
  };

  const saveBusinessUpiField = async () => {
    try {
      await setBusinessUpiId(businessUpi);
      const cleaned = businessUpi.trim().toLowerCase();
      setBusinessUpiState(cleaned);
      setSavedBusinessUpi(cleaned);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save UPI ID');
    }
  };

  const saveWhatsappTemplateField = async () => {
    try {
      await setWhatsappMessageTemplate(whatsappTemplate);
      const profile = await getBusinessProfile();
      setWhatsappTemplateState(profile.whatsapp_message_template);
      setSavedWhatsappTemplate(profile.whatsapp_message_template);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save WhatsApp template');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={localStyles.sectionCard}>
        <FormInput
          label="Business name"
          value={businessName}
          onChangeText={setBusinessNameState}
          placeholder="Your business name"
          onEndEditing={saveBusinessNameField}
        />
        <FormInput
          label="Address"
          value={businessAddress}
          onChangeText={setBusinessAddressState}
          placeholder="Registered address"
          multiline
          onEndEditing={saveBusinessAddressField}
        />
        <FormInput
          label="GSTIN"
          value={businessGstin}
          onChangeText={setBusinessGstinState}
          placeholder="15-character GSTIN"
          autoCapitalize="characters"
          onEndEditing={saveBusinessGstinField}
        />
        <FormInput
          label="State code"
          value={businessState}
          onChangeText={setBusinessStateState}
          placeholder="e.g. 27"
          keyboardType="number-pad"
          helperText={
            businessState.trim()
              ? stateName(businessState.trim()) || 'Unknown state code — use 01–38'
              : '2-digit GST state code (e.g. 27 = Maharashtra)'
          }
          onEndEditing={saveBusinessStateField}
        />
        <View style={localStyles.settingsRow}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>GST enabled</Text>
            <Text style={localStyles.rowMeta}>
              When on, sales and purchases calculate GST breakup
            </Text>
          </View>
          <Switch
            value={gstEnabled}
            onValueChange={toggleGstEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
        <View style={localStyles.settingsRow}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>Tax-inclusive prices</Text>
            <Text style={localStyles.rowMeta}>
              When on, entered rates include GST (tax is reverse-calculated)
            </Text>
          </View>
          <Switch
            value={taxInclusive}
            onValueChange={toggleTaxInclusive}
            disabled={!gstEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
        <SettingsDivider color={colors.borderLight} />
        <FormInput
          label="UPI ID (payment QR)"
          value={businessUpi}
          onChangeText={setBusinessUpiState}
          placeholder="business@okaxis"
          autoCapitalize="none"
          helperText="Shown as a scan-to-pay QR on Tax Invoice / BOS PDFs"
          onEndEditing={saveBusinessUpiField}
        />
        <SettingsDivider color={colors.borderLight} />
        <FormInput
          label="WhatsApp message template"
          value={whatsappTemplate}
          onChangeText={setWhatsappTemplateState}
          multiline
          helperText="Placeholders: {party} {invoice_no} {amount} {doc_type}"
          onEndEditing={saveWhatsappTemplateField}
        />
      </View>
    </ScrollView>
  );
}

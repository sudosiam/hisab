import React, { useCallback, useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FormInput, useScreenStyles } from '../../../src/components/ui';
import { formatSqliteError } from '../../../src/db/database';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { useTheme } from '../../../src/context/ThemeContext';
import {
  getBusinessProfile,
  setBusinessName,
  setBusinessAddress,
  setBusinessUpiId,
  setWhatsappMessageTemplate,
} from '../../../src/services/appSettings';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';

export default function BusinessSettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();

  const [businessName, setBusinessNameState] = useState('');
  const [businessAddress, setBusinessAddressState] = useState('');
  const [businessUpi, setBusinessUpiState] = useState('');
  const [whatsappTemplate, setWhatsappTemplateState] = useState('');
  const [savedBusinessName, setSavedBusinessName] = useState('');
  const [savedBusinessAddress, setSavedBusinessAddress] = useState('');
  const [savedBusinessUpi, setSavedBusinessUpi] = useState('');
  const [savedWhatsappTemplate, setSavedWhatsappTemplate] = useState('');

  const profileDirty =
    businessName !== savedBusinessName ||
    businessAddress !== savedBusinessAddress ||
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
      setBusinessUpiState(profile.business_upi_id);
      setWhatsappTemplateState(profile.whatsapp_message_template);
      setSavedBusinessName(profile.business_name);
      setSavedBusinessAddress(profile.business_address);
      setSavedBusinessUpi(profile.business_upi_id);
      setSavedWhatsappTemplate(profile.whatsapp_message_template);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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

  const saveBusinessUpiField = async () => {
    try {
      await setBusinessUpiId(businessUpi);
      const saved = (await getBusinessProfile()).business_upi_id;
      setBusinessUpiState(saved);
      setSavedBusinessUpi(saved);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save UPI ID');
      setBusinessUpiState((await getBusinessProfile()).business_upi_id);
    }
  };

  const saveWhatsappTemplateField = async () => {
    try {
      await setWhatsappMessageTemplate(whatsappTemplate);
      const saved = (await getBusinessProfile()).whatsapp_message_template;
      setWhatsappTemplateState(saved);
      setSavedWhatsappTemplate(saved);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save WhatsApp template');
      setWhatsappTemplateState((await getBusinessProfile()).whatsapp_message_template);
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
        <SettingsDivider color={colors.borderLight} />
        <FormInput
          label="UPI ID (payment QR)"
          value={businessUpi}
          onChangeText={setBusinessUpiState}
          placeholder="business@okaxis"
          autoCapitalize="none"
          onEndEditing={saveBusinessUpiField}
        />
        <SettingsDivider color={colors.borderLight} />
        <FormInput
          label="WhatsApp message template"
          value={whatsappTemplate}
          onChangeText={setWhatsappTemplateState}
          multiline
          placeholder="{party} {invoice_no} {amount} {doc_type}"
          onEndEditing={saveWhatsappTemplateField}
        />
      </View>
    </ScrollView>
  );
}

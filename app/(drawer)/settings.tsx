import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FormInput, PrimaryButton, SectionHeader, ThemeOption, useScreenStyles } from '../../src/components/ui';
import { FinancialYearPicker } from '../../src/components/FinancialYearPicker';
import { resetDatabase, formatSqliteError } from '../../src/db/database';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useFinancialYear } from '../../src/context/FinancialYearContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import type { ThemeMode } from '../../src/constants/theme';
import { APP_VERSION } from '../../src/constants/appVersion';
import {
  getSaleInvoicePrefix,
  setSaleInvoicePrefix,
  getBosInvoicePrefix,
  setBosInvoicePrefix,
  getPurchaseInvoicePrefix,
  setPurchaseInvoicePrefix,
  getBusinessProfile,
  setBusinessName,
  setBusinessAddress,
  setBusinessGstin,
  setBusinessState,
  setGstEnabled,
  setTaxInclusivePricing,
  setBusinessUpiId,
  setWhatsappMessageTemplate,
} from '../../src/services/appSettings';
import { stateName } from '../../src/services/gst';
import {
  previewNextInvoiceFromSetting,
  getNextSaleInvoiceNo,
  getNextBosInvoiceNo,
  getNextPurchaseInvoiceNo,
} from '../../src/services/invoiceNumbers';
import { getFinancialYearRangeLabel, MONTH_SHORT_NAMES } from '../../src/utils/date';
import { clearAllDrafts } from '../../src/services/formDrafts';
import {
  backupDatabase,
  ensureBackupFolderReady,
  exportDatabase,
  getBackupFolderUri,
  getBackupLastError,
  getLastBackupAt,
  formatLastBackupLabel,
  isAutoBackupEnabled,
  isAutoBackupPaused,
  pickBackupFolder,
  restoreDatabaseFromBackup,
  restoreLatestFromBackupFolder,
  setAutoBackupEnabled,
} from '../../src/services/backup';
import { spacing, radius } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';

const RESET_CONFIRM_TEXT = 'RESET';
const IMPORT_CONFIRM_TEXT = 'IMPORT';

function SettingsSection({
  title,
  children,
  cardStyle,
}: {
  title: string;
  children: React.ReactNode;
  cardStyle?: object;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <SectionHeader title={title} />
      <View style={cardStyle}>{children}</View>
    </View>
  );
}

function SettingsDivider({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color, marginVertical: spacing.xs }} />;
}

export default function SettingsScreen() {
  const { refresh } = useDatabase();
  const {
    fyStartMonth,
    selectedFyStartYear,
    fyOptions,
    savingFy,
    setFyStartMonth,
    setSelectedFyStartYear,
    reload: reloadFinancialYear,
  } = useFinancialYear();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        sectionCard: {
          ...cardSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
        },
        themeRow: {
          flexDirection: 'row',
          gap: spacing.xs,
        },
        settingsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          minHeight: 48,
          gap: spacing.md,
        },
        rowStack: {
          flex: 1,
        },
        rowLabel: {
          fontSize: 14,
          fontWeight: '500',
          color: colors.text,
        },
        rowMeta: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: 1,
        },
        rowAction: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.primary,
        },
        rowValue: {
          fontSize: 13,
          color: colors.textSecondary,
          textAlign: 'right',
          flexShrink: 1,
        },
        buttonStack: {
          gap: spacing.sm,
          marginTop: spacing.sm,
        },
        outlineBtn: {
          paddingVertical: 11,
          minHeight: 44,
          borderRadius: radius.full,
          borderWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primaryContainer,
        },
        outlineBtnText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.onPrimaryContainer,
        },
        dangerBtn: {
          paddingVertical: 11,
          minHeight: 44,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.danger + '44',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        },
        dangerText: {
          color: colors.danger,
          fontWeight: '600',
          fontSize: 14,
        },
        aboutRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.xs,
          minHeight: 40,
        },
        aboutLabel: {
          fontSize: 14,
          color: colors.textSecondary,
        },
        aboutValue: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: spacing.md,
        },
        modalSheet: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          borderRadius: radius.xl,
        },
        modalTitle: {
          fontSize: 17,
          fontWeight: '700',
          color: colors.text,
          marginBottom: spacing.xs,
        },
        modalText: {
          fontSize: 13,
          color: colors.textSecondary,
          lineHeight: 18,
          marginBottom: spacing.md,
        },
        modalActions: {
          flexDirection: 'row',
          gap: spacing.sm,
          marginTop: spacing.md,
        },
        modalCancel: {
          flex: 1,
          paddingVertical: 11,
          minHeight: 44,
          borderRadius: radius.full,
          borderWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceContainer,
        },
        modalCancelText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        monthGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.xs,
          marginTop: spacing.sm,
        },
        monthChip: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radius.full,
          borderWidth: 0,
          backgroundColor: colors.surfaceContainer,
        },
        monthChipActive: {
          backgroundColor: colors.primaryContainer,
          borderColor: colors.primaryContainer,
        },
        monthChipText: {
          fontSize: 13,
          color: colors.text,
        },
        monthChipTextActive: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.onPrimaryContainer,
        },
      }),
    [colors, isDark]
  );

  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [autoBackup, setAutoBackup] = useState(false);
  const [backupPaused, setBackupPaused] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<{ at: string; message: string } | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resetting, setResetting] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importConfirmInput, setImportConfirmInput] = useState('');
  const [salePrefix, setSalePrefix] = useState('S');
  const [bosPrefix, setBosPrefix] = useState('BOS');
  const [purchasePrefix, setPurchasePrefix] = useState('P');
  const [savedSalePrefix, setSavedSalePrefix] = useState('S');
  const [savedBosPrefix, setSavedBosPrefix] = useState('BOS');
  const [savedPurchasePrefix, setSavedPurchasePrefix] = useState('P');
  const [nextSaleInvoice, setNextSaleInvoice] = useState('');
  const [nextBosInvoice, setNextBosInvoice] = useState('');
  const [nextPurchaseInvoice, setNextPurchaseInvoice] = useState('');
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

  const prefixesDirty =
    salePrefix !== savedSalePrefix ||
    bosPrefix !== savedBosPrefix ||
    purchasePrefix !== savedPurchasePrefix;
  const profileDirty =
    businessName !== savedBusinessName ||
    businessAddress !== savedBusinessAddress ||
    businessGstin !== savedBusinessGstin ||
    businessState !== savedBusinessState ||
    businessUpi !== savedBusinessUpi ||
    whatsappTemplate !== savedWhatsappTemplate;
  useUnsavedChangesGuard(prefixesDirty || profileDirty, {
    title: 'Discard settings?',
    message: 'You have unsaved invoice or business profile changes.',
  });

  const load = useCallback(async () => {
    try {
      const uri = await getBackupFolderUri();
      if (uri) {
        try {
          await ensureBackupFolderReady(uri);
        } catch {
          // Folder may be temporarily unavailable; backup actions will surface errors.
        }
      }
      setFolderUri(uri);
      setAutoBackup(await isAutoBackupEnabled());
      setBackupPaused(await isAutoBackupPaused());
      setLastBackupAt(await getLastBackupAt());
      setBackupError(await getBackupLastError());
      await reloadFinancialYear();
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
  }, [reloadFinancialYear]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handlePickFolder = async () => {
    try {
      const uri = await pickBackupFolder();
      if (uri) {
        setFolderUri(uri);
        Alert.alert('Success', 'Backup folder set. Daily backups will be saved here.');
      }
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  };

  const handleBackup = async () => {
    if (!folderUri) {
      Alert.alert('Choose a backup folder', 'Select where backups are saved first.');
      return;
    }
    if (backingUp) return;
    setBackingUp(true);
    try {
      const result = await backupDatabase();
      setLastBackupAt(await getLastBackupAt());
      setBackupError(await getBackupLastError());
      Alert.alert(result.success ? 'Backup Complete' : 'Backup Failed', result.message);
    } catch (e) {
      Alert.alert('Backup Failed', formatSqliteError(e));
    } finally {
      setBackingUp(false);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportDatabase();
      if (result.success) {
        Alert.alert('Export Complete', result.message);
      } else {
        Alert.alert('Export Failed', result.message);
      }
    } catch (e) {
      Alert.alert('Export Failed', formatSqliteError(e));
    } finally {
      setExporting(false);
    }
  };

  const canConfirmImport = importConfirmInput.trim().toUpperCase() === IMPORT_CONFIRM_TEXT;

  const openImportModal = () => {
    setImportConfirmInput('');
    setImportModalOpen(true);
  };

  const closeImportModal = () => {
    if (restoring) return;
    setImportModalOpen(false);
    setImportConfirmInput('');
  };

  const performRestoreFromFolder = async () => {
    setRestoring(true);
    try {
      const result = await restoreLatestFromBackupFolder();
      if (result.success) {
        await clearAllDrafts().catch(() => {});
        setBackupPaused(false);
        refresh();
        await load();
        Alert.alert('Imported', result.message);
      } else {
        Alert.alert('Import Failed', result.message);
      }
    } catch (e) {
      Alert.alert('Import Failed', formatSqliteError(e));
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreFromFolder = () => {
    if (!folderUri) {
      Alert.alert('Choose a backup folder', 'Select where backups are saved first.');
      return;
    }
    if (restoring) return;
    // Restoring replaces the live books — never do it on a single tap.
    Alert.alert(
      'Restore from backup folder?',
      'This replaces ALL current data with the latest backup in your backup folder. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => void performRestoreFromFolder() },
      ]
    );
  };

  const handleRestore = async () => {
    if (!canConfirmImport || restoring) return;
    setRestoring(true);
    try {
      const result = await restoreDatabaseFromBackup();
      if (result.success) {
        await clearAllDrafts().catch(() => {});
        setBackupPaused(false);
        refresh();
        setImportModalOpen(false);
        setImportConfirmInput('');
        Alert.alert('Imported', result.message);
      } else if (result.message !== 'Import cancelled') {
        Alert.alert('Import Failed', result.message);
      }
    } catch (e) {
      Alert.alert('Import Failed', formatSqliteError(e));
    } finally {
      setRestoring(false);
    }
  };

  const toggleAuto = async (value: boolean) => {
    try {
      if (value && (await isAutoBackupPaused())) {
        Alert.alert(
          'Restore first',
          'Backup is paused after reset. Restore from your backup folder before turning auto backup on.'
        );
        return;
      }
      setAutoBackup(value);
      await setAutoBackupEnabled(value);
    } catch (e) {
      setAutoBackup(!value);
      Alert.alert('Error', formatSqliteError(e));
    }
  };

  const setMode = (mode: ThemeMode) => setThemeMode(mode);

  const handleFyStartMonthChange = async (month: number) => {
    try {
      await setFyStartMonth(month);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save start month');
    }
  };

  const handleFyChange = async (startYear: number) => {
    try {
      await setSelectedFyStartYear(startYear);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save financial year');
    }
  };

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

  const folderLabel = folderUri
    ? folderUri.split('/').filter(Boolean).slice(-2).join('/')
    : 'Not set';

  const canConfirmReset = resetConfirmInput.trim().toUpperCase() === RESET_CONFIRM_TEXT;

  const openResetModal = () => {
    setResetConfirmInput('');
    setResetModalOpen(true);
  };

  const closeResetModal = () => {
    if (resetting) return;
    setResetModalOpen(false);
    setResetConfirmInput('');
  };

  const handleResetDatabase = async () => {
    if (!canConfirmReset || resetting) return;
    setResetting(true);
    try {
      await resetDatabase();
      await clearAllDrafts().catch(() => {});
      setAutoBackup(false);
      setBackupPaused(true);
      refresh();
      setResetModalOpen(false);
      setResetConfirmInput('');
      Alert.alert('Done', 'Database reset. Default accounts recreated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not reset database');
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SettingsSection title="Appearance" cardStyle={localStyles.sectionCard}>
        <View style={localStyles.themeRow}>
          <ThemeOption label="Light" selected={themeMode === 'light'} onPress={() => setMode('light')} />
          <ThemeOption label="Dark" selected={themeMode === 'dark'} onPress={() => setMode('dark')} />
          <ThemeOption label="System" selected={themeMode === 'system'} onPress={() => setMode('system')} />
        </View>
      </SettingsSection>

      <SettingsSection title="Business Profile" cardStyle={localStyles.sectionCard}>
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
      </SettingsSection>

      <SettingsSection title="Financial Year" cardStyle={localStyles.sectionCard}>
        <FinancialYearPicker
          label=""
          options={fyOptions}
          value={selectedFyStartYear}
          onChange={handleFyChange}
        />
        <SettingsDivider color={colors.borderLight} />
        <Text style={localStyles.rowLabel}>Year starts in</Text>
        <Text style={localStyles.rowMeta}>
          Current: {getFinancialYearRangeLabel(fyStartMonth)} · affects all reports
        </Text>
        <View style={localStyles.monthGrid}>
          {MONTH_SHORT_NAMES.map((label, index) => {
            const month = index + 1;
            const active = fyStartMonth === month;
            return (
              <TouchableOpacity
                key={label}
                style={[localStyles.monthChip, active && localStyles.monthChipActive]}
                onPress={() => handleFyStartMonthChange(month)}
                disabled={savingFy}
                accessibilityLabel={`Financial year starts in ${label}`}
              >
                <Text style={active ? localStyles.monthChipTextActive : localStyles.monthChipText}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SettingsSection>

      <SettingsSection title="Invoicing" cardStyle={localStyles.sectionCard}>
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
      </SettingsSection>

      <SettingsSection title="Backup" cardStyle={localStyles.sectionCard}>
        <TouchableOpacity style={localStyles.settingsRow} onPress={handlePickFolder} activeOpacity={0.7}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>Backup folder</Text>
            <Text style={localStyles.rowMeta} numberOfLines={1}>
              {folderLabel}
            </Text>
          </View>
          <Text style={localStyles.rowAction}>Change</Text>
        </TouchableOpacity>

        <SettingsDivider color={colors.borderLight} />

        <View style={localStyles.settingsRow}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>Daily auto backup</Text>
            <Text style={localStyles.rowMeta}>
              Once a day {'&'} when you leave the app · Saves the database file ·
              Last: {formatLastBackupLabel(lastBackupAt)}
            </Text>
          </View>
          <Switch
            value={autoBackup}
            onValueChange={toggleAuto}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        {backupPaused ? (
          <>
            <SettingsDivider color={colors.borderLight} />
            <View style={localStyles.rowStack}>
              <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
                Backup paused after reset
              </Text>
              <Text style={localStyles.rowMeta}>
                Auto backup is off and won{"'"}t overwrite your backup folder until you restore.
                Use {'"'}Restore from backup folder{'"'} below.
              </Text>
            </View>
          </>
        ) : null}

        {backupError ? (
          <>
            <SettingsDivider color={colors.borderLight} />
            <View style={localStyles.rowStack}>
              <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
                Last backup didn’t complete
              </Text>
              <Text style={localStyles.rowMeta}>
                {backupError.message} Tap “Back up now” to retry — you may need to re-select the
                backup folder.
              </Text>
            </View>
          </>
        ) : null}

        <SettingsDivider color={colors.borderLight} />

        <View style={localStyles.buttonStack}>
          <TouchableOpacity
            style={localStyles.outlineBtn}
            onPress={handleBackup}
            disabled={backingUp}
            activeOpacity={0.7}
          >
            <Text style={localStyles.outlineBtnText}>{backingUp ? 'Backing up…' : 'Back up now'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={localStyles.outlineBtn}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.7}
          >
            <Text style={localStyles.outlineBtnText}>
              {exporting ? 'Exporting…' : 'Export database file'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={localStyles.outlineBtn}
            onPress={handleRestoreFromFolder}
            disabled={restoring || !folderUri}
            activeOpacity={0.7}
          >
            <Text style={localStyles.outlineBtnText}>
              {restoring ? 'Importing…' : 'Restore from backup folder'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={localStyles.outlineBtn}
            onPress={openImportModal}
            disabled={restoring}
            activeOpacity={0.7}
          >
            <Text style={localStyles.outlineBtnText}>
              {restoring ? 'Importing…' : 'Import backup file'}
            </Text>
          </TouchableOpacity>
        </View>
      </SettingsSection>

      <SettingsSection title="Data" cardStyle={localStyles.sectionCard}>
        <TouchableOpacity
          style={localStyles.dangerBtn}
          onPress={openResetModal}
          activeOpacity={0.7}
        >
          <Text style={localStyles.dangerText}>Reset database</Text>
        </TouchableOpacity>
      </SettingsSection>

      <SettingsSection title="About" cardStyle={localStyles.sectionCard}>
        <View style={localStyles.aboutRow}>
          <Text style={localStyles.aboutLabel}>Version</Text>
          <Text style={localStyles.aboutValue}>{APP_VERSION}</Text>
        </View>
      </SettingsSection>
    </ScrollView>

    <Modal visible={resetModalOpen} transparent animationType="fade" onRequestClose={closeResetModal}>
      <Pressable style={localStyles.modalBackdrop} onPress={closeResetModal}>
        <Pressable style={localStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={localStyles.modalTitle}>Reset database</Text>
          <Text style={localStyles.modalText}>
            All local data will be deleted. This cannot be undone. Type {RESET_CONFIRM_TEXT} to
            confirm.
          </Text>
          <FormInput
            label="Confirmation"
            value={resetConfirmInput}
            onChangeText={setResetConfirmInput}
            placeholder={RESET_CONFIRM_TEXT}
            keyboardType="default"
          />
          <View style={localStyles.modalActions}>
            <TouchableOpacity style={localStyles.modalCancel} onPress={closeResetModal} disabled={resetting}>
              <Text style={localStyles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Reset"
                onPress={handleResetDatabase}
                loading={resetting}
                disabled={!canConfirmReset}
                variant="danger"
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>

    <Modal visible={importModalOpen} transparent animationType="fade" onRequestClose={closeImportModal}>
      <Pressable style={localStyles.modalBackdrop} onPress={closeImportModal}>
        <Pressable style={localStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={localStyles.modalTitle}>Import backup</Text>
          <Text style={localStyles.modalText}>
            This replaces all current data with the chosen backup database file (.db).
            A snapshot of your current data is kept during the import in case the file is bad. Type{' '}
            {IMPORT_CONFIRM_TEXT} to confirm.
          </Text>
          <FormInput
            label="Confirmation"
            value={importConfirmInput}
            onChangeText={setImportConfirmInput}
            placeholder={IMPORT_CONFIRM_TEXT}
            keyboardType="default"
          />
          <View style={localStyles.modalActions}>
            <TouchableOpacity style={localStyles.modalCancel} onPress={closeImportModal} disabled={restoring}>
              <Text style={localStyles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Choose file & import"
                onPress={handleRestore}
                loading={restoring}
                disabled={!canConfirmImport}
                variant="danger"
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

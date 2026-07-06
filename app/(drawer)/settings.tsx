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
import { PinEntryModal, type PinModalMode } from '../../src/components/PinEntryModal';
import { useAppLock } from '../../src/context/AppLockContext';
import {
  changePin,
  disableAppLock,
  setupPin,
  setBiometricUnlockEnabled,
  verifyPin,
} from '../../src/services/appLock';
import { resetDatabase } from '../../src/db/database';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useFinancialYear } from '../../src/context/FinancialYearContext';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeMode } from '../../src/constants/theme';
import { APP_VERSION } from '../../src/constants/appVersion';
import {
  getSaleInvoicePrefix,
  setSaleInvoicePrefix,
  getPurchaseInvoicePrefix,
  setPurchaseInvoicePrefix,
} from '../../src/services/appSettings';
import { previewNextInvoiceFromSetting, getNextSaleInvoiceNo, getNextPurchaseInvoiceNo } from '../../src/services/invoiceNumbers';
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
    <View style={{ marginBottom: spacing.lg }}>
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
  const {
    lockEnabled,
    lockSupported,
    biometricEnabled,
    biometricAvailable,
    biometricLabel,
    refreshLockSettings,
    unlock,
  } = useAppLock();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const styles = useScreenStyles();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        sectionCard: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
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
          gap: spacing.md,
        },
        rowStack: {
          flex: 1,
        },
        rowLabel: {
          fontSize: 15,
          fontWeight: '500',
          color: colors.text,
        },
        rowMeta: {
          fontSize: 13,
          color: colors.textSecondary,
          marginTop: 2,
        },
        rowAction: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.primary,
        },
        rowValue: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'right',
          flexShrink: 1,
        },
        buttonStack: {
          gap: spacing.sm,
          marginTop: spacing.sm,
        },
        outlineBtn: {
          paddingVertical: 13,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          backgroundColor: colors.inputBg,
        },
        outlineBtnText: {
          fontSize: 15,
          fontWeight: '600',
          color: colors.text,
        },
        dangerBtn: {
          paddingVertical: 13,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.danger + '44',
          alignItems: 'center',
          backgroundColor: colors.surface,
        },
        dangerText: {
          color: colors.danger,
          fontWeight: '600',
          fontSize: 15,
        },
        aboutRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.xs,
        },
        aboutLabel: {
          fontSize: 15,
          color: colors.textSecondary,
        },
        aboutValue: {
          fontSize: 15,
          fontWeight: '600',
          color: colors.text,
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        modalSheet: {
          ...cardSurface(colors, isDark),
          padding: spacing.lg,
        },
        modalTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.text,
          marginBottom: spacing.xs,
        },
        modalText: {
          fontSize: 14,
          color: colors.textSecondary,
          lineHeight: 20,
          marginBottom: spacing.md,
        },
        modalActions: {
          flexDirection: 'row',
          gap: spacing.sm,
          marginTop: spacing.md,
        },
        modalCancel: {
          flex: 1,
          paddingVertical: 13,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        },
        modalCancelText: {
          fontSize: 15,
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
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.inputBg,
        },
        monthChipActive: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        monthChipText: {
          fontSize: 13,
          color: colors.text,
        },
        monthChipTextActive: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.onPrimary,
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
  const [pinModalMode, setPinModalMode] = useState<PinModalMode | null>(null);
  const [pendingBiometricValue, setPendingBiometricValue] = useState<boolean | null>(null);
  const [pendingPin, setPendingPin] = useState('');
  const [currentPinForChange, setCurrentPinForChange] = useState('');
  const [newPinForChange, setNewPinForChange] = useState('');
  const [salePrefix, setSalePrefix] = useState('S');
  const [purchasePrefix, setPurchasePrefix] = useState('P');
  const [nextSaleInvoice, setNextSaleInvoice] = useState('');
  const [nextPurchaseInvoice, setNextPurchaseInvoice] = useState('');

  const load = useCallback(async () => {
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
    setSalePrefix(await getSaleInvoicePrefix());
    setPurchasePrefix(await getPurchaseInvoicePrefix());
    setNextSaleInvoice(await getNextSaleInvoiceNo());
    setNextPurchaseInvoice(await getNextPurchaseInvoiceNo());
  }, [reloadFinancialYear]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handlePickFolder = async () => {
    const uri = await pickBackupFolder();
    if (uri) {
      setFolderUri(uri);
      Alert.alert('Success', 'Backup folder ready (database/, media/, and full/ zip folders created).');
    }
  };

  const handleBackup = async () => {
    if (!folderUri) {
      Alert.alert('Choose a backup folder', 'Select where backups are saved first.');
      return;
    }
    setBackingUp(true);
    const result = await backupDatabase();
    setBackingUp(false);
    setLastBackupAt(await getLastBackupAt());
    setBackupError(await getBackupLastError());
    Alert.alert(result.success ? 'Backup Complete' : 'Backup Failed', result.message);
  };

  const handleExport = async () => {
    setExporting(true);
    const result = await exportDatabase();
    setExporting(false);
    if (!result.success) {
      Alert.alert('Export Failed', result.message);
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

  const handleRestoreFromFolder = async () => {
    if (!folderUri) {
      Alert.alert('Choose a backup folder', 'Select where backups are saved first.');
      return;
    }
    setRestoring(true);
    try {
      const result = await restoreLatestFromBackupFolder();
      if (result.success) {
        await clearAllDrafts().catch(() => {});
        setBackupPaused(false);
        refresh();
        Alert.alert('Imported', result.message);
      } else {
        Alert.alert('Import Failed', result.message);
      }
    } finally {
      setRestoring(false);
    }
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
    } finally {
      setRestoring(false);
    }
  };

  const toggleAuto = async (value: boolean) => {
    if (value && (await isAutoBackupPaused())) {
      Alert.alert(
        'Restore first',
        'Backup is paused after reset. Restore from your backup folder before turning auto backup on.'
      );
      return;
    }
    setAutoBackup(value);
    await setAutoBackupEnabled(value);
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
      setSalePrefix(await getSaleInvoicePrefix());
      setNextSaleInvoice(await getNextSaleInvoiceNo());
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save sale numbering');
      setSalePrefix(await getSaleInvoicePrefix());
    }
  };

  const savePurchasePrefix = async () => {
    try {
      await setPurchaseInvoicePrefix(purchasePrefix);
      setPurchasePrefix(await getPurchaseInvoicePrefix());
      setNextPurchaseInvoice(await getNextPurchaseInvoiceNo());
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save purchase numbering');
      setPurchasePrefix(await getPurchaseInvoicePrefix());
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

  const closePinModal = () => {
    setPinModalMode(null);
    setPendingPin('');
    setCurrentPinForChange('');
    setNewPinForChange('');
    setPendingBiometricValue(null);
  };

  const handlePinModalComplete = async ({ pin }: { pin: string }) => {
    if (pinModalMode === 'setup') {
      setPendingPin(pin);
      setPinModalMode('setup-confirm');
      return;
    }

    if (pinModalMode === 'setup-confirm') {
      if (pin !== pendingPin) throw new Error('PINs do not match');
      await setupPin(pin);
      await refreshLockSettings();
      unlock();
      closePinModal();
      Alert.alert('App lock enabled', 'Your PIN is set. The app locks when you leave it.');
      return;
    }

    if (pinModalMode === 'disable') {
      await disableAppLock(pin);
      await refreshLockSettings();
      closePinModal();
      return;
    }

    if (pinModalMode === 'change-current') {
      if (!(await verifyPin(pin))) throw new Error('Current PIN is incorrect');
      setCurrentPinForChange(pin);
      setPinModalMode('change-new');
      return;
    }

    if (pinModalMode === 'change-new') {
      setNewPinForChange(pin);
      setPinModalMode('change-confirm');
      return;
    }

    if (pinModalMode === 'change-confirm') {
      if (pin !== newPinForChange) throw new Error('PINs do not match');
      await changePin(currentPinForChange, pin);
      closePinModal();
      Alert.alert('PIN updated', 'Your new PIN is saved.');
      return;
    }

    if (pinModalMode === 'biometric') {
      if (pendingBiometricValue === null) {
        closePinModal();
        return;
      }
      await setBiometricUnlockEnabled(pendingBiometricValue, pin);
      await refreshLockSettings();
      closePinModal();
    }
  };

  const handleLockToggle = (value: boolean) => {
    if (value) {
      setPinModalMode('setup');
      return;
    }
    setPinModalMode('disable');
  };

  const handleBiometricToggle = (value: boolean) => {
    // Changing biometric unlock always requires the PIN.
    setPendingBiometricValue(value);
    setPinModalMode('biometric');
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

      {lockSupported ? (
        <SettingsSection title="Security" cardStyle={localStyles.sectionCard}>
          <View style={localStyles.settingsRow}>
            <View style={localStyles.rowStack}>
              <Text style={localStyles.rowLabel}>App lock</Text>
              <Text style={localStyles.rowMeta}>Require PIN when opening the app</Text>
            </View>
            <Switch
              value={lockEnabled}
              onValueChange={handleLockToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          {lockEnabled && biometricAvailable ? (
            <>
              <SettingsDivider color={colors.borderLight} />
              <View style={localStyles.settingsRow}>
                <View style={localStyles.rowStack}>
                  <Text style={localStyles.rowLabel}>{biometricLabel}</Text>
                  <Text style={localStyles.rowMeta}>Unlock with biometrics after PIN is set</Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
            </>
          ) : null}

          {lockEnabled ? (
            <>
              <SettingsDivider color={colors.borderLight} />
              <TouchableOpacity
                style={localStyles.settingsRow}
                onPress={() => setPinModalMode('change-current')}
                activeOpacity={0.7}
              >
                <Text style={localStyles.rowLabel}>Change PIN</Text>
                <Text style={localStyles.rowAction}>Update</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </SettingsSection>
      ) : null}

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
              Once a day &amp; when you leave the app · Saves database, photos, and a full zip ·
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
                Auto backup is off and won&apos;t overwrite your backup folder until you restore.
                Use &quot;Restore from backup folder&quot; below.
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
              {exporting ? 'Exporting…' : 'Export full backup (zip)'}
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
            This replaces all current data with the backup file (.db or full .zip with photos).
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

    <PinEntryModal
      visible={pinModalMode !== null}
      mode={pinModalMode ?? 'setup'}
      onClose={closePinModal}
      onComplete={handlePinModalComplete}
    />
    </>
  );
}

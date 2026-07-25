import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Switch,
  Alert,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { clearAllDrafts } from '../../../src/services/formDrafts';
import {
  backupDatabase,
  dismissBackupPauseForFreshStart,
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
} from '../../../src/services/backup';
import {
  enableCloudBackupAfterSignIn,
  getCloudBackupLastError,
  getCloudUserEmail,
  getLastCloudBackupAt,
  isCloudBackupEnabled,
  CLOUD_PASSWORD_MIN_SIGN_IN,
  CLOUD_PASSWORD_MIN_SIGN_UP,
  restoreDatabaseFromCloud,
  setCloudBackupEnabled,
  signInWithEmailPassword,
  signOutCloudBackup,
  signUpWithEmailPassword,
  uploadCloudBackup,
} from '../../../src/services/cloudBackup';
import { isSupabaseConfigured } from '../../../src/services/supabaseClient';
import {
  getBackupBackgroundTaskStatusLabel,
} from '../../../src/services/backupBackgroundTask';
import { spacing } from '../../../src/constants/theme';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';

const IMPORT_CONFIRM_TEXT = 'IMPORT';

export default function BackupSettingsScreen() {
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();

  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [autoBackup, setAutoBackup] = useState(false);
  const [backupPaused, setBackupPaused] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<{ at: string; message: string } | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [cloudConfigured] = useState(() => isSupabaseConfigured());
  const [cloudBackup, setCloudBackup] = useState(false);
  const [cloudEmail, setCloudEmail] = useState<string | null>(null);
  const [lastCloudBackupAt, setLastCloudBackupAt] = useState<string | null>(null);
  const [cloudBackupError, setCloudBackupError] = useState<{ at: string; message: string } | null>(
    null
  );
  const [cloudBackingUp, setCloudBackingUp] = useState(false);
  const [cloudAuthModalOpen, setCloudAuthModalOpen] = useState(false);
  const [cloudAuthEmail, setCloudAuthEmail] = useState('');
  const [cloudAuthPassword, setCloudAuthPassword] = useState('');
  const [cloudAuthBusy, setCloudAuthBusy] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importConfirmInput, setImportConfirmInput] = useState('');
  const [osScheduleLabel, setOsScheduleLabel] = useState('…');

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
      setCloudBackup(await isCloudBackupEnabled());
      setCloudEmail(await getCloudUserEmail());
      setLastCloudBackupAt(await getLastCloudBackupAt());
      setCloudBackupError(await getCloudBackupLastError());
      setOsScheduleLabel(await getBackupBackgroundTaskStatusLabel());
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, []);

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
      Alert.alert(result.success ? 'Export Complete' : 'Export Failed', result.message);
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
        refresh();
        await load();
        Alert.alert(
          'Imported',
          `${result.message} Previous backup settings were turned back on.`
        );
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
        refresh();
        setImportModalOpen(false);
        setImportConfirmInput('');
        await load();
        Alert.alert(
          'Imported',
          `${result.message} Previous backup settings were turned back on.`
        );
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
          'Restore your data first',
          'After a reset, use Restore from backup folder, Import backup file, or Restore from cloud below. Auto backup turns back on by itself after a successful restore — you do not need to flip this switch first.'
        );
        return;
      }
      setAutoBackup(value);
      await setAutoBackupEnabled(value);
      setOsScheduleLabel(await getBackupBackgroundTaskStatusLabel());
    } catch (e) {
      setAutoBackup(!value);
      Alert.alert('Error', formatSqliteError(e));
    }
  };

  const handleStartFresh = () => {
    Alert.alert(
      'Start fresh without restore?',
      'Keeps the empty database. Auto backup stays off until you turn it on (and have data). Your existing backup files/cloud snapshot are not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start fresh',
          style: 'destructive',
          onPress: async () => {
            try {
              await dismissBackupPauseForFreshStart();
              setBackupPaused(false);
              setOsScheduleLabel(await getBackupBackgroundTaskStatusLabel());
              Alert.alert('Ready', 'You can enter data and turn backups on when you want.');
            } catch (e) {
              Alert.alert('Error', formatSqliteError(e));
            }
          },
        },
      ]
    );
  };

  const openCloudAuthModal = () => {
    setCloudAuthEmail(cloudEmail ?? '');
    setCloudAuthPassword('');
    setCloudAuthModalOpen(true);
  };

  const closeCloudAuthModal = () => {
    if (cloudAuthBusy) return;
    setCloudAuthModalOpen(false);
    setCloudAuthPassword('');
  };

  const refreshCloudStatus = async () => {
    setCloudBackup(await isCloudBackupEnabled());
    setCloudEmail(await getCloudUserEmail());
    setLastCloudBackupAt(await getLastCloudBackupAt());
    setCloudBackupError(await getCloudBackupLastError());
  };

  const finishCloudAuth = async (authResult: { success: boolean; message: string }) => {
    if (!authResult.success) {
      Alert.alert('Sign in failed', authResult.message);
      return;
    }
    // After reset, do not auto-enable/upload — user should restore first.
    if (await isAutoBackupPaused()) {
      await refreshCloudStatus();
      setCloudAuthModalOpen(false);
      setCloudAuthPassword('');
      Alert.alert(
        'Signed in',
        'Tap “Restore from cloud” to bring your data back. Backups stay paused until restore succeeds.'
      );
      return;
    }
    const upload = await enableCloudBackupAfterSignIn();
    await refreshCloudStatus();
    setCloudAuthModalOpen(false);
    setCloudAuthPassword('');
    setOsScheduleLabel(await getBackupBackgroundTaskStatusLabel());
    Alert.alert(
      upload.success ? 'Cloud backup on' : 'Signed in',
      upload.success
        ? 'First full backup uploaded. Daily cloud backups will run when you open the app.'
        : `Signed in, but the first upload failed: ${upload.message}`
    );
  };

  const handleCloudSignIn = async () => {
    if (cloudAuthBusy) return;
    setCloudAuthBusy(true);
    try {
      await finishCloudAuth(await signInWithEmailPassword(cloudAuthEmail, cloudAuthPassword));
    } catch (e) {
      Alert.alert('Sign in failed', formatSqliteError(e));
    } finally {
      setCloudAuthBusy(false);
    }
  };

  const handleCloudSignUp = async () => {
    if (cloudAuthBusy) return;
    setCloudAuthBusy(true);
    try {
      await finishCloudAuth(await signUpWithEmailPassword(cloudAuthEmail, cloudAuthPassword));
    } catch (e) {
      Alert.alert('Sign up failed', formatSqliteError(e));
    } finally {
      setCloudAuthBusy(false);
    }
  };

  const toggleCloudBackup = async (value: boolean) => {
    if (!cloudConfigured) {
      Alert.alert(
        'Cloud backup not configured',
        'This build is missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.'
      );
      return;
    }
    try {
      if (value) {
        if (await isAutoBackupPaused()) {
          Alert.alert(
            'Restore your data first',
            'After a reset, restore from folder, file, or cloud below. Cloud backup will turn back on automatically after a successful restore.'
          );
          return;
        }
        const email = await getCloudUserEmail();
        if (!email) {
          openCloudAuthModal();
          return;
        }
        setCloudBackup(true);
        await setCloudBackupEnabled(true);
        setCloudBackingUp(true);
        try {
          const result = await uploadCloudBackup();
          await refreshCloudStatus();
          if (!result.success) {
            Alert.alert('Cloud backup failed', result.message);
          }
        } finally {
          setCloudBackingUp(false);
        }
        return;
      }
      setCloudBackup(false);
      await setCloudBackupEnabled(false);
    } catch (e) {
      setCloudBackup(!value);
      Alert.alert('Error', formatSqliteError(e));
    }
  };

  const handleCloudBackupNow = async () => {
    if (cloudBackingUp) return;
    if (!(await getCloudUserEmail())) {
      openCloudAuthModal();
      return;
    }
    setCloudBackingUp(true);
    try {
      const result = await uploadCloudBackup();
      await refreshCloudStatus();
      Alert.alert(result.success ? 'Cloud backup complete' : 'Cloud backup failed', result.message);
    } catch (e) {
      Alert.alert('Cloud backup failed', formatSqliteError(e));
    } finally {
      setCloudBackingUp(false);
    }
  };

  const performRestoreFromCloud = async () => {
    setRestoring(true);
    try {
      const result = await restoreDatabaseFromCloud();
      if (result.success) {
        await clearAllDrafts().catch(() => {});
        refresh();
        await load();
        Alert.alert(
          'Imported',
          `${result.message} Previous backup settings were turned back on.`
        );
      } else {
        Alert.alert('Import failed', result.message);
      }
    } catch (e) {
      Alert.alert('Import failed', formatSqliteError(e));
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreFromCloud = () => {
    if (restoring) return;
    Alert.alert(
      'Restore from cloud?',
      'This replaces ALL current data with your latest cloud backup. This is backup only — not multi-device sync. Last upload wins.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => void performRestoreFromCloud() },
      ]
    );
  };

  const handleCloudSignOut = async () => {
    try {
      const result = await signOutCloudBackup();
      await refreshCloudStatus();
      Alert.alert(result.success ? 'Signed out' : 'Sign out failed', result.message);
    } catch (e) {
      Alert.alert('Sign out failed', formatSqliteError(e));
    }
  };

  const folderLabel = folderUri
    ? folderUri.split('/').filter(Boolean).slice(-2).join('/')
    : 'Not set';

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {backupPaused ? (
          <View style={localStyles.sectionCard}>
            <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
              Backup paused after reset
            </Text>
            <Text style={localStyles.rowMeta}>
              Do not turn the backup switches on yet. Restore your data with one of the buttons
              below — auto/cloud backup will turn back on automatically after a successful restore.
            </Text>
            <View style={localStyles.buttonStack}>
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
              {cloudConfigured && cloudEmail ? (
                <TouchableOpacity
                  style={localStyles.outlineBtn}
                  onPress={handleRestoreFromCloud}
                  disabled={restoring || cloudBackingUp}
                  activeOpacity={0.7}
                >
                  <Text style={localStyles.outlineBtnText}>
                    {restoring ? 'Importing…' : 'Restore from cloud'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {cloudConfigured && !cloudEmail ? (
                <TouchableOpacity
                  style={localStyles.outlineBtn}
                  onPress={openCloudAuthModal}
                  disabled={restoring}
                  activeOpacity={0.7}
                >
                  <Text style={localStyles.outlineBtnText}>Sign in for cloud restore</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={localStyles.dangerBtn}
                onPress={handleStartFresh}
                disabled={restoring}
                activeOpacity={0.7}
              >
                <Text style={localStyles.dangerText}>Start fresh (skip restore)</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <SectionHeader title="On this device" />
        <View style={localStyles.sectionCard}>
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
                Once a day when you open/leave the app, plus an OS schedule (~daily) · Last:{' '}
                {formatLastBackupLabel(lastBackupAt)}
              </Text>
            </View>
            <Switch
              value={autoBackup}
              onValueChange={toggleAuto}
              disabled={backupPaused}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          {backupError && !backupPaused ? (
            <>
              <SettingsDivider color={colors.borderLight} />
              <View style={localStyles.rowStack}>
                <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
                  Last backup didn’t complete
                </Text>
                <Text style={localStyles.rowMeta}>{backupError.message}</Text>
              </View>
            </>
          ) : null}

          {!backupPaused ? (
            <View style={localStyles.buttonStack}>
              <TouchableOpacity
                style={localStyles.outlineBtn}
                onPress={handleBackup}
                disabled={backingUp}
                activeOpacity={0.7}
              >
                <Text style={localStyles.outlineBtnText}>
                  {backingUp ? 'Backing up…' : 'Back up now'}
                </Text>
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
          ) : null}
        </View>

        <SectionHeader title="Cloud" />
        <View style={localStyles.sectionCard}>
          <View style={localStyles.settingsRow}>
            <View style={localStyles.rowStack}>
              <Text style={localStyles.rowLabel}>Cloud backup</Text>
              <Text style={localStyles.rowMeta}>
                {!cloudConfigured
                  ? 'Not configured on this build'
                  : cloudEmail
                    ? `${cloudEmail} · Last: ${formatLastBackupLabel(lastCloudBackupAt)}`
                    : `Email + password · Last: ${formatLastBackupLabel(lastCloudBackupAt)}`}
              </Text>
            </View>
            <Switch
              value={cloudBackup && Boolean(cloudEmail)}
              onValueChange={toggleCloudBackup}
              disabled={!cloudConfigured || backupPaused}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          <Text style={[localStyles.rowMeta, { marginBottom: spacing.sm }]}>
            Backup only — not multi-device sync. Last upload wins.
          </Text>

          <SettingsDivider color={colors.borderLight} />
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>OS daily schedule</Text>
            <Text style={localStyles.rowMeta}>{osScheduleLabel}</Text>
          </View>

          {cloudBackupError && !backupPaused ? (
            <>
              <SettingsDivider color={colors.borderLight} />
              <View style={localStyles.rowStack}>
                <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
                  Last cloud backup didn’t complete
                </Text>
                <Text style={localStyles.rowMeta}>{cloudBackupError.message}</Text>
              </View>
            </>
          ) : null}

          {cloudConfigured && !backupPaused ? (
            <View style={localStyles.buttonStack}>
              {!cloudEmail ? (
                <TouchableOpacity
                  style={localStyles.outlineBtn}
                  onPress={openCloudAuthModal}
                  activeOpacity={0.7}
                >
                  <Text style={localStyles.outlineBtnText}>Sign in for cloud backup</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={localStyles.outlineBtn}
                    onPress={handleCloudBackupNow}
                    disabled={cloudBackingUp}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>
                      {cloudBackingUp ? 'Uploading…' : 'Back up to cloud now'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={localStyles.outlineBtn}
                    onPress={handleRestoreFromCloud}
                    disabled={restoring || cloudBackingUp}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>
                      {restoring ? 'Importing…' : 'Restore from cloud'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={localStyles.outlineBtn}
                    onPress={handleCloudSignOut}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>Sign out</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={importModalOpen} transparent animationType="fade" onRequestClose={closeImportModal}>
        <Pressable style={localStyles.modalBackdrop} onPress={closeImportModal}>
          <Pressable style={localStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={localStyles.modalTitle}>Import backup</Text>
            <Text style={localStyles.modalText}>
              This replaces all current data with the chosen backup database file (.db). Type{' '}
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
              <TouchableOpacity
                style={localStyles.modalCancel}
                onPress={closeImportModal}
                disabled={restoring}
              >
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

      <Modal
        visible={cloudAuthModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeCloudAuthModal}
      >
        <Pressable style={localStyles.modalBackdrop} onPress={closeCloudAuthModal}>
          <Pressable style={localStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={localStyles.modalTitle}>Cloud backup sign-in</Text>
            <Text style={localStyles.modalText}>
              Sign in with email and password to store a full database backup in the cloud.
            </Text>
            <FormInput
              label="Email"
              value={cloudAuthEmail}
              onChangeText={setCloudAuthEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!cloudAuthBusy}
            />
            <FormInput
              label="Password"
              value={cloudAuthPassword}
              onChangeText={setCloudAuthPassword}
              placeholder={`At least ${CLOUD_PASSWORD_MIN_SIGN_UP} characters (new accounts)`}
              autoCapitalize="none"
              secureTextEntry
              editable={!cloudAuthBusy}
            />
            <View style={localStyles.modalActions}>
              <TouchableOpacity
                style={localStyles.modalCancel}
                onPress={closeCloudAuthModal}
                disabled={cloudAuthBusy}
              >
                <Text style={localStyles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, gap: spacing.sm }}>
                <PrimaryButton
                  title="Sign in"
                  onPress={handleCloudSignIn}
                  loading={cloudAuthBusy}
                  disabled={
                    !cloudAuthEmail.trim() ||
                    cloudAuthPassword.length < CLOUD_PASSWORD_MIN_SIGN_IN
                  }
                />
                <PrimaryButton
                  title="Create account"
                  onPress={handleCloudSignUp}
                  loading={cloudAuthBusy}
                  disabled={
                    !cloudAuthEmail.trim() ||
                    cloudAuthPassword.length < CLOUD_PASSWORD_MIN_SIGN_UP
                  }
                  variant="secondary"
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

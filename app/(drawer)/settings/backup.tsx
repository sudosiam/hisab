import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Alert,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { ThemedSwitch } from '../../../src/components/ThemedSwitch';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { clearAllDrafts } from '../../../src/services/formDrafts';
import { isDbMaintenanceBusy, isRestoreInProgress } from '../../../src/services/dbMaintenance';
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
  isDeviceFolderBackupSupported,
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
  getCloudOwnerEmail,
  isCloudOwnerLockEnabled,
  restoreDatabaseFromCloud,
  setCloudBackupEnabled,
  signInWithEmailPassword,
  signOutCloudBackup,
  signUpWithEmailPassword,
  uploadCloudBackup,
  deleteCloudBackups,
  listCloudBackupSnapshots,
  restoreDatabaseFromCloudFile,
  type CloudBackupSnapshot,
} from '../../../src/services/cloudBackup';
import { isSupabaseConfigured } from '../../../src/services/supabaseClient';
import { getBackupBackgroundTaskStatusLabel } from '../../../src/services/backupBackgroundTask';
import { spacing } from '../../../src/constants/theme';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { showPostRestoreChecklist } from '../../../src/utils/postRestoreChecklist';

const IMPORT_CONFIRM_TEXT = 'IMPORT';

type RestoreSource = 'file' | 'folder' | 'cloud';

export default function BackupSettingsScreen() {
  const { refresh } = useDatabaseActions();
  const router = useRouter();
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();
  const folderSupported = isDeviceFolderBackupSupported();

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
  const [cloudSnapshots, setCloudSnapshots] = useState<CloudBackupSnapshot[]>([]);
  const [cloudAuthModalOpen, setCloudAuthModalOpen] = useState(false);
  const [cloudAuthEmail, setCloudAuthEmail] = useState('');
  const [cloudAuthPassword, setCloudAuthPassword] = useState('');
  const [cloudAuthBusy, setCloudAuthBusy] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<RestoreSource>('file');
  const [importConfirmInput, setImportConfirmInput] = useState('');
  const [osScheduleLabel, setOsScheduleLabel] = useState('…');

  const load = useCallback(async () => {
    try {
      const uri = await getBackupFolderUri();
      if (uri && folderSupported) {
        try {
          await ensureBackupFolderReady(uri);
        } catch {
          // Folder may be temporarily unavailable; backup actions will surface errors.
        }
      }
      setFolderUri(folderSupported ? uri : null);
      setAutoBackup(await isAutoBackupEnabled());
      setBackupPaused(await isAutoBackupPaused());
      setLastBackupAt(await getLastBackupAt());
      setBackupError(await getBackupLastError());
      setCloudBackup(await isCloudBackupEnabled());
      setCloudEmail(await getCloudUserEmail());
      setLastCloudBackupAt(await getLastCloudBackupAt());
      setCloudBackupError(await getCloudBackupLastError());
      setOsScheduleLabel(await getBackupBackgroundTaskStatusLabel());
      if (cloudConfigured && (await getCloudUserEmail())) {
        const listed = await listCloudBackupSnapshots();
        setCloudSnapshots(listed.success ? listed.snapshots : []);
      } else {
        setCloudSnapshots([]);
      }
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [folderSupported, cloudConfigured]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const refreshCloudStatus = async () => {
    setCloudBackup(await isCloudBackupEnabled());
    setCloudEmail(await getCloudUserEmail());
    setLastCloudBackupAt(await getLastCloudBackupAt());
    setCloudBackupError(await getCloudBackupLastError());
    if (await getCloudUserEmail()) {
      const listed = await listCloudBackupSnapshots();
      setCloudSnapshots(listed.success ? listed.snapshots : []);
    } else {
      setCloudSnapshots([]);
    }
  };

  const afterSuccessfulRestore = async (message: string) => {
    await clearAllDrafts().catch((err) => console.warn('[backup] clear drafts after restore failed', err));
    refresh();
    await load();
    try {
      const { syncOverdueReminders } = await import('../../../src/services/overdueReminders');
      await syncOverdueReminders();
    } catch {
      // optional
    }
    Alert.alert(
      'Restored',
      `${message} Unsaved form drafts were cleared. The app data has been reloaded. Backup settings were turned back on.`,
      [{ text: 'Continue', onPress: () => showPostRestoreChecklist(router) }]
    );
  };

  const runCloudUpload = async (force = false) => {
    const result = await uploadCloudBackup({ force });
    await refreshCloudStatus();
    if (result.needsForce) {
      Alert.alert('Remote backup is newer', result.message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Force upload',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCloudBackingUp(true);
              try {
                const forced = await uploadCloudBackup({ force: true });
                await refreshCloudStatus();
                Alert.alert(
                  forced.success ? 'Cloud backup complete' : 'Cloud backup failed',
                  forced.message
                );
              } finally {
                setCloudBackingUp(false);
              }
            })();
          },
        },
      ]);
      return;
    }
    Alert.alert(result.success ? 'Cloud backup complete' : 'Cloud backup failed', result.message);
  };

  const handleRestoreCloudSnapshot = (snap: CloudBackupSnapshot) => {
    Alert.alert(
      'Restore this snapshot?',
      snap.isLatest
        ? 'Restores the latest cloud backup onto this device.'
        : `Restores ${snap.dateKey ?? snap.fileName} onto this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (restoring || isDbMaintenanceBusy()) return;
              setRestoring(true);
              try {
                const result = await restoreDatabaseFromCloudFile(snap.fileName);
                if (result.success) {
                  await afterSuccessfulRestore(result.message);
                } else {
                  Alert.alert('Restore failed', result.message);
                }
              } catch (e) {
                Alert.alert('Restore failed', formatSqliteError(e));
              } finally {
                setRestoring(false);
              }
            })();
          },
        },
      ]
    );
  };

  const canConfirmImport = importConfirmInput.trim().toUpperCase() === IMPORT_CONFIRM_TEXT;

  const openImportModal = (mode: RestoreSource) => {
    if (isDbMaintenanceBusy() || isRestoreInProgress()) {
      Alert.alert('Please wait', 'A backup or restore is already in progress.');
      return;
    }
    setImportMode(mode);
    setImportConfirmInput('');
    setImportModalOpen(true);
  };

  const closeImportModal = () => {
    if (restoring) return;
    setImportModalOpen(false);
    setImportConfirmInput('');
  };

  const handleConfirmRestore = async () => {
    if (!canConfirmImport || restoring) return;
    if (isDbMaintenanceBusy() || isRestoreInProgress()) {
      Alert.alert('Please wait', 'A backup or restore is already in progress.');
      return;
    }
    setRestoring(true);
    try {
      const result =
        importMode === 'folder'
          ? await restoreLatestFromBackupFolder()
          : importMode === 'cloud'
            ? await restoreDatabaseFromCloud()
            : await restoreDatabaseFromBackup();
      if (result.success) {
        setImportModalOpen(false);
        setImportConfirmInput('');
        await afterSuccessfulRestore(result.message);
      } else if (result.message !== 'Import cancelled') {
        Alert.alert('Restore failed', result.message);
      }
    } catch (e) {
      Alert.alert('Restore failed', formatSqliteError(e));
    } finally {
      setRestoring(false);
    }
  };

  const handlePickFolder = async () => {
    try {
      const uri = await pickBackupFolder();
      if (uri) {
        setFolderUri(uri);
        Alert.alert('Folder set', 'Daily device backups will be saved here.');
      }
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  };

  const handleBackup = async () => {
    if (!folderUri) {
      Alert.alert('Choose a folder', 'Pick where device backups are saved first.');
      return;
    }
    if (backingUp || isDbMaintenanceBusy()) {
      if (!backingUp) {
        Alert.alert('Please wait', 'A backup or restore is already in progress.');
      }
      return;
    }
    setBackingUp(true);
    try {
      const result = await backupDatabase();
      setLastBackupAt(await getLastBackupAt());
      setBackupError(await getBackupLastError());
      Alert.alert(result.success ? 'Backup complete' : 'Backup failed', result.message);
    } catch (e) {
      Alert.alert('Backup failed', formatSqliteError(e));
    } finally {
      setBackingUp(false);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportDatabase();
      Alert.alert(result.success ? 'Export complete' : 'Export failed', result.message);
    } catch (e) {
      Alert.alert('Export failed', formatSqliteError(e));
    } finally {
      setExporting(false);
    }
  };

  const toggleAuto = async (value: boolean) => {
    try {
      if (value && (await isAutoBackupPaused())) {
        Alert.alert(
          'Restore first',
          'After a reset, restore your data below. Auto backup turns back on after a successful restore.'
        );
        return;
      }
      if (value && !folderUri) {
        Alert.alert('Choose a folder', 'Pick a backup folder before turning on daily device backup.');
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
      'Start fresh?',
      'Keeps the empty database. Existing backup files and cloud snapshots are not deleted.',
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
              Alert.alert('Ready', 'Add data, then turn backups on when you want.');
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

  const finishCloudAuth = async (authResult: { success: boolean; message: string }) => {
    if (!authResult.success) {
      Alert.alert('Sign in failed', authResult.message);
      return;
    }
    if (await isAutoBackupPaused()) {
      await refreshCloudStatus();
      setCloudAuthModalOpen(false);
      setCloudAuthPassword('');
      Alert.alert('Signed in', 'Tap Restore from cloud to bring your data back.');
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
        ? 'First backup uploaded. Daily cloud backups run when you open or leave the app.'
        : `Signed in, but first upload failed: ${upload.message}`
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
        'Cloud not configured',
        'This build is missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.'
      );
      return;
    }
    try {
      if (value) {
        if (await isAutoBackupPaused()) {
          Alert.alert(
            'Restore first',
            'After a reset, restore from folder, file, or cloud. Cloud backup turns back on after restore.'
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
          if (result.needsForce) {
            Alert.alert('Remote backup is newer', result.message, [
              { text: 'Keep enabled', style: 'cancel' },
              {
                text: 'Force upload',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    setCloudBackingUp(true);
                    try {
                      const forced = await uploadCloudBackup({ force: true });
                      await refreshCloudStatus();
                      if (!forced.success) Alert.alert('Cloud backup failed', forced.message);
                    } finally {
                      setCloudBackingUp(false);
                    }
                  })();
                },
              },
            ]);
          } else if (!result.success) {
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
      await runCloudUpload(false);
    } catch (e) {
      Alert.alert('Cloud backup failed', formatSqliteError(e));
    } finally {
      setCloudBackingUp(false);
    }
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

  const handleDeleteCloudBackup = () => {
    Alert.alert(
      'Delete cloud backup?',
      'Removes cloud backup files only. Data on this device is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const result = await deleteCloudBackups();
                await refreshCloudStatus();
                Alert.alert(result.success ? 'Deleted' : 'Delete failed', result.message);
              } catch (e) {
                Alert.alert('Delete failed', formatSqliteError(e));
              }
            })();
          },
        },
      ]
    );
  };

  const folderLabel = folderUri
    ? folderUri.split('/').filter(Boolean).slice(-2).join('/')
    : 'Not set';

  const importTitle =
    importMode === 'folder'
      ? 'Restore from folder'
      : importMode === 'cloud'
        ? 'Restore from cloud'
        : 'Import backup file';
  const importBody =
    importMode === 'folder'
      ? 'Replaces all data with the latest folder backup. Unsaved form drafts will be cleared and screens will reload.'
      : importMode === 'cloud'
        ? 'Replaces all data on this device with your latest cloud snapshot (last backup wins). Unsaved form drafts will be cleared and screens will reload.'
        : 'Replaces all data with the chosen backup file. Unsaved form drafts will be cleared and screens will reload.';
  const confirmButtonTitle =
    importMode === 'file' ? 'Choose file & import' : 'Import & replace data';

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {backupPaused ? (
          <View style={localStyles.sectionCard}>
            <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
              Backup paused after reset
            </Text>
            <View style={localStyles.buttonStack}>
              {folderSupported ? (
                <TouchableOpacity
                  style={localStyles.outlineBtn}
                  onPress={() => openImportModal('folder')}
                  disabled={restoring || !folderUri}
                  activeOpacity={0.7}
                >
                  <Text style={localStyles.outlineBtnText}>Restore from folder</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={localStyles.outlineBtn}
                onPress={() => openImportModal('file')}
                disabled={restoring}
                activeOpacity={0.7}
              >
                <Text style={localStyles.outlineBtnText}>Import backup file</Text>
              </TouchableOpacity>
              {cloudConfigured && cloudEmail ? (
                <TouchableOpacity
                  style={localStyles.outlineBtn}
                  onPress={() => openImportModal('cloud')}
                  disabled={restoring || cloudBackingUp}
                  activeOpacity={0.7}
                >
                  <Text style={localStyles.outlineBtnText}>Restore from cloud</Text>
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

        {folderSupported ? (
          <>
            <SectionHeader title="On this device" />
            <View style={localStyles.sectionCard}>
              <TouchableOpacity
                style={localStyles.settingsRow}
                onPress={handlePickFolder}
                activeOpacity={0.7}
              >
                <View style={localStyles.rowStack}>
                  <Text style={localStyles.rowLabel}>Backup folder</Text>
                  <Text style={localStyles.rowMeta} numberOfLines={1}>
                    {folderLabel}
                  </Text>
                </View>
                <Text style={localStyles.rowAction}>Choose</Text>
              </TouchableOpacity>

              <SettingsDivider color={colors.borderLight} />

              <View style={localStyles.settingsRow}>
                <View style={localStyles.rowStack}>
                  <Text style={localStyles.rowLabel}>Daily auto backup</Text>
                  <Text style={localStyles.rowMeta}>
                    Last: {formatLastBackupLabel(lastBackupAt)}
                    {'\n'}Shows a device notification when today’s auto backup finishes (native APK).
                  </Text>
                </View>
                <ThemedSwitch
                  value={autoBackup}
                  onValueChange={toggleAuto}
                  disabled={backupPaused}
                />
              </View>

              {backupError && !backupPaused ? (
                <>
                  <SettingsDivider color={colors.borderLight} />
                  <View style={localStyles.rowStack}>
                    <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
                      Last device backup failed
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
                    onPress={() => openImportModal('folder')}
                    disabled={restoring || !folderUri}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>Restore from folder</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={localStyles.outlineBtn}
                    onPress={() => openImportModal('file')}
                    disabled={restoring}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>Import backup file</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <SectionHeader title="On this device" />
            <View style={localStyles.sectionCard}>
              <View style={localStyles.rowStack}>
                <Text style={localStyles.rowLabel}>Files backup</Text>
                <Text style={localStyles.rowMeta}>
                  On iOS, export a copy to Files (or share), and restore by picking a backup file.
                  Daily folder auto-backup is Android-only — use cloud backup for automatic uploads.
                </Text>
              </View>
              {!backupPaused ? (
                <View style={localStyles.buttonStack}>
                  <TouchableOpacity
                    style={localStyles.outlineBtn}
                    onPress={handleExport}
                    disabled={exporting}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>
                      {exporting ? 'Exporting…' : 'Export to Files'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={localStyles.outlineBtn}
                    onPress={() => openImportModal('file')}
                    disabled={restoring}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>Restore from Files</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </>
        )}

        <SectionHeader title="Cloud" />
        <View style={localStyles.sectionCard}>
          <View style={localStyles.settingsRow}>
            <View style={localStyles.rowStack}>
              <Text style={localStyles.rowLabel}>Cloud backup</Text>
              <Text style={localStyles.rowMeta}>
                {!cloudConfigured
                  ? 'Not configured'
                  : cloudEmail
                    ? `${cloudEmail} · ${formatLastBackupLabel(lastCloudBackupAt)}`
                    : formatLastBackupLabel(lastCloudBackupAt)}
              </Text>
              <Text style={[localStyles.rowMeta, { marginTop: 4 }]}>
                Full database snapshot only — not multi-device sync. Restore replaces all data on this
                device (last backup wins). A notification appears when the daily cloud auto backup
                completes (native APK).
              </Text>
            </View>
            <ThemedSwitch
              value={cloudBackup && Boolean(cloudEmail)}
              onValueChange={toggleCloudBackup}
              disabled={!cloudConfigured || backupPaused}
            />
          </View>

          {cloudBackupError && !backupPaused ? (
            <>
              <SettingsDivider color={colors.borderLight} />
              <View style={localStyles.rowStack}>
                <Text style={[localStyles.rowLabel, { color: colors.danger }]}>
                  Last cloud backup failed
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
                  <Text style={localStyles.outlineBtnText}>Sign in</Text>
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
                      {cloudBackingUp ? 'Uploading…' : 'Back up now'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={localStyles.outlineBtn}
                    onPress={() => openImportModal('cloud')}
                    disabled={restoring || cloudBackingUp}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.outlineBtnText}>Restore latest from cloud</Text>
                  </TouchableOpacity>
                  {cloudSnapshots.length > 0 ? (
                    <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
                      <Text style={localStyles.rowLabel}>Cloud snapshots</Text>
                      <Text style={localStyles.rowMeta}>
                        Dated copies kept for 30 days. Tap to restore a specific day.
                      </Text>
                      {cloudSnapshots.slice(0, 10).map((snap) => (
                        <TouchableOpacity
                          key={snap.fileName}
                          style={localStyles.outlineBtn}
                          onPress={() => handleRestoreCloudSnapshot(snap)}
                          disabled={restoring}
                          activeOpacity={0.7}
                        >
                          <Text style={localStyles.outlineBtnText}>
                            {snap.isLatest
                              ? 'Latest'
                              : snap.dateKey
                                ? `Backup ${snap.dateKey}`
                                : snap.fileName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
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

        <SectionHeader title="More" />
        <View style={localStyles.sectionCard}>
          <View style={localStyles.buttonStack}>
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
            {cloudConfigured && cloudEmail && !backupPaused ? (
              <TouchableOpacity
                style={localStyles.dangerBtn}
                onPress={handleDeleteCloudBackup}
                activeOpacity={0.7}
              >
                <Text style={localStyles.dangerText}>Delete cloud backup</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[localStyles.rowMeta, { marginTop: spacing.sm }]}>{osScheduleLabel}</Text>
        </View>
      </ScrollView>

      <Modal visible={importModalOpen} transparent animationType="fade" onRequestClose={closeImportModal}>
        <Pressable style={localStyles.modalBackdrop} onPress={closeImportModal}>
          <Pressable style={localStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={localStyles.modalTitle}>{importTitle}</Text>
            <Text style={localStyles.modalText}>
              {importBody} Type {IMPORT_CONFIRM_TEXT}.
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
                  title={confirmButtonTitle}
                  onPress={handleConfirmRestore}
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
            <Text style={localStyles.modalTitle}>Cloud sign-in</Text>
            <Text style={localStyles.modalText}>
              {isCloudOwnerLockEnabled()
                ? `Sign in as ${getCloudOwnerEmail()}.`
                : 'Sign in with email and password.'}
            </Text>
            <FormInput
              label="Email"
              value={cloudAuthEmail}
              onChangeText={setCloudAuthEmail}
              placeholder={getCloudOwnerEmail() ?? 'you@example.com'}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!cloudAuthBusy}
            />
            <FormInput
              label="Password"
              value={cloudAuthPassword}
              onChangeText={setCloudAuthPassword}
              placeholder={`At least ${CLOUD_PASSWORD_MIN_SIGN_UP} characters`}
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

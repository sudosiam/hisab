import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, AppState, Alert, InteractionManager, Modal, Pressable, TouchableOpacity, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppBootScreen } from '../components/AppBootScreen';
import {
  getDatabase,
  resetDatabase,
  invalidateDatabase,
  formatSqliteError,
  repairFinancialDataIntegrity,
} from '../db/database';
import { ensureLedgerUpToDate } from '../services/ledger';
import {
  backupOnBackground,
  runDueBackups,
  restoreDatabaseFromBackup,
  restoreLatestFromBackupFolder,
  isDeviceFolderBackupSupported,
} from '../services/backup';
import {
  cloudBackupOnBackground,
  reconcileCloudBackupOnEmptyLocal,
  restoreDatabaseFromCloud,
  getCloudUserEmail,
} from '../services/cloudBackup';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { syncBackupBackgroundTask } from '../services/backupBackgroundTask';
import { processRecurringExpenses } from '../services/banking';
import { clearAllDrafts } from '../services/formDrafts';
import { useTheme } from './ThemeContext';
import { spacing, radius } from '../constants/theme';
import { FormInput, PrimaryButton } from '../components/ui';

const IMPORT_CONFIRM_TEXT = 'IMPORT';

SplashScreen.preventAutoHideAsync().catch(() => {});

type RestoreSource = 'file' | 'folder' | 'cloud';

interface DatabaseActionsValue {
  ready: boolean;
  refresh: () => void;
}

interface DatabaseVersionValue {
  refreshKey: number;
}

const DatabaseActionsContext = createContext<DatabaseActionsValue>({
  ready: false,
  refresh: () => {},
});

const DatabaseVersionContext = createContext<DatabaseVersionValue>({
  refreshKey: 0,
});

/** @deprecated Prefer useDatabaseActions + useRefreshKey for fewer re-renders. */
interface DatabaseContextValue extends DatabaseActionsValue, DatabaseVersionValue {}

const DatabaseContext = createContext<DatabaseContextValue>({
  ready: false,
  refreshKey: 0,
  refresh: () => {},
});

function DatabaseErrorUI({
  error,
  onRetry,
  onRestoreFromFolder,
  onRestoreFromFile,
  onRestoreFromCloud,
  showFolderRestore,
  showCloudRestore,
  onReset,
  importModalOpen,
  importConfirmInput,
  importMode,
  onImportConfirmChange,
  onImportConfirm,
  onImportCancel,
  restoring,
}: {
  error: string;
  onRetry: () => void;
  onRestoreFromFolder: () => void;
  onRestoreFromFile: () => void;
  onRestoreFromCloud?: () => void;
  showFolderRestore: boolean;
  showCloudRestore: boolean;
  onReset: () => void;
  importModalOpen: boolean;
  importConfirmInput: string;
  importMode: RestoreSource;
  onImportConfirmChange: (value: string) => void;
  onImportConfirm: () => void;
  onImportCancel: () => void;
  restoring: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const importTitle =
    importMode === 'folder'
      ? 'Restore from folder'
      : importMode === 'cloud'
        ? 'Restore from cloud'
        : 'Import backup file';
  const importBody =
    importMode === 'folder'
      ? 'Replaces all data with the latest folder backup.'
      : importMode === 'cloud'
        ? 'Replaces all data with your latest cloud backup.'
        : 'Replaces all data with the chosen backup file.';
  const confirmTitle =
    importMode === 'file' ? 'Choose file & import' : 'Import & replace data';
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Could not open Hisab</Text>
      <Text style={styles.errorText}>{error}</Text>
      <Text style={styles.retryLink} onPress={onRetry}>
        Try again
      </Text>
      {showFolderRestore ? (
        <Text style={styles.retryLink} onPress={onRestoreFromFolder}>
          Restore from backup folder
        </Text>
      ) : null}
      <Text style={styles.retryLink} onPress={onRestoreFromFile}>
        Choose backup file
      </Text>
      {showCloudRestore && onRestoreFromCloud ? (
        <Text style={styles.retryLink} onPress={onRestoreFromCloud}>
          Restore from cloud
        </Text>
      ) : null}
      <Text style={styles.resetLink} onPress={onReset}>
        Reset database
      </Text>

      <Modal visible={importModalOpen} transparent animationType="fade" onRequestClose={onImportCancel}>
        <Pressable style={styles.modalBackdrop} onPress={onImportCancel}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.errorTitle}>{importTitle}</Text>
            <Text style={styles.errorText}>
              {importBody} Type {IMPORT_CONFIRM_TEXT}.
            </Text>
            <FormInput
              label="Confirmation"
              value={importConfirmInput}
              onChangeText={onImportConfirmChange}
              placeholder={IMPORT_CONFIRM_TEXT}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={onImportCancel} disabled={restoring}>
                <Text style={styles.retryLink}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={confirmTitle}
                  onPress={onImportConfirm}
                  loading={restoring}
                  disabled={importConfirmInput.trim().toUpperCase() !== IMPORT_CONFIRM_TEXT}
                  variant="danger"
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importConfirmInput, setImportConfirmInput] = useState('');
  const [importMode, setImportMode] = useState<RestoreSource>('file');
  const [restoring, setRestoring] = useState(false);
  const [cloudRestoreAvailable, setCloudRestoreAvailable] = useState(false);

  useEffect(() => {
    if (!error || !isSupabaseConfigured()) {
      setCloudRestoreAvailable(false);
      return;
    }
    let active = true;
    void getCloudUserEmail()
      .then((email) => {
        if (active) setCloudRestoreAvailable(Boolean(email));
      })
      .catch((err) => {
        console.warn('[boot] cloud email check failed', err);
        if (active) setCloudRestoreAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [error]);

  useEffect(() => {
    let active = true;

    const boot = async (allowRetry: boolean) => {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(
              new Error(
                'Opening the database is taking too long. Try again or restore a backup.'
              )
            );
          }, 20000);
          getDatabase()
            .then(() => {
              clearTimeout(timer);
              resolve();
            })
            .catch((err) => {
              clearTimeout(timer);
              reject(err);
            });
        });
        if (!active) return;
        setReady(true);
        setError(null);
      } catch (err) {
        if (!active) return;
        if (allowRetry) {
          await invalidateDatabase();
          await boot(false);
          return;
        }
        setReady(false);
        await invalidateDatabase();
        setError(formatSqliteError(err));
        SplashScreen.hideAsync().catch(() => {});
      }
    };

    boot(true);

    return () => {
      active = false;
    };
  }, [initAttempt]);

  useEffect(() => {
    if (!ready) return;

    SplashScreen.hideAsync().catch(() => {});

    const ledgerTask = InteractionManager.runAfterInteractions(() => {
      ensureLedgerUpToDate().catch((err) => {
        console.warn('[boot] ledger update failed', err);
      });
      // Heavy integrity repair after first paint — once per schema version.
      void repairFinancialDataIntegrity(undefined, { force: false, rebuildLedger: false }).catch(
        (err) => {
          console.warn('[boot] integrity repair failed', err);
        }
      );
    });

    const recurringTimer = setTimeout(() => {
      processRecurringExpenses()
        .then((created) => {
          if (created > 0) setRefreshKey((k) => k + 1);
        })
        .catch((err) => console.warn('[boot] recurring expenses failed', err));
    }, 1000);

    // Defer backup so DB + UI finish mounting first (avoids Android SAF native crashes).
    const backupTimer = setTimeout(() => {
      void (async () => {
        const reconcile = await reconcileCloudBackupOnEmptyLocal().catch((err) => {
          console.warn('[boot] cloud reconcile failed', err);
          return { restored: false as const };
        });
        if (reconcile.restored) {
          await clearAllDrafts().catch((err) => console.warn('[boot] clear drafts failed', err));
          setRefreshKey((k) => k + 1);
          setInitAttempt((a) => a + 1);
          return;
        }
        await runDueBackups().catch((err) => console.warn('[boot] due backups failed', err));
        await syncBackupBackgroundTask().catch((err) => console.warn('[boot] backup task sync failed', err));
      })();
    }, 3000);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        processRecurringExpenses()
          .then((created) => {
            if (created > 0) setRefreshKey((k) => k + 1);
          })
          .catch((err) => console.warn('[boot] recurring expenses (foreground) failed', err));
      }
      // Prefer `background` only — `inactive` fires on iOS control center / Android dialogs.
      if (state === 'background') {
        backupOnBackground().catch((err) => console.warn('[boot] device backup on background failed', err));
        cloudBackupOnBackground().catch((err) => console.warn('[boot] cloud backup on background failed', err));
      }
    });

    return () => {
      ledgerTask.cancel();
      clearTimeout(recurringTimer);
      clearTimeout(backupTimer);
      subscription.remove();
    };
  }, [ready]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Debounced home-widget sync after DB writes settle (Android custom builds only).
  useEffect(() => {
    if (!ready || Platform.OS !== 'android' || refreshKey === 0) return;
    const timer = setTimeout(() => {
      void import('../services/widgetSnapshot')
        .then((m) => m.refreshHomeWidgets())
        .catch((err) => console.warn('[widgets] debounce refresh failed', err));
    }, 900);
    return () => clearTimeout(timer);
  }, [ready, refreshKey]);

  const actionsValue = useMemo<DatabaseActionsValue>(
    () => ({ ready, refresh }),
    [ready, refresh]
  );

  const versionValue = useMemo<DatabaseVersionValue>(
    () => ({ refreshKey }),
    [refreshKey]
  );

  const wrap = (
    child: React.ReactNode,
    opts?: { ready?: boolean; refreshKey?: number }
  ) => {
    const actions =
      opts?.ready === undefined ? actionsValue : { ready: opts.ready, refresh };
    const version =
      opts?.refreshKey === undefined ? versionValue : { refreshKey: opts.refreshKey };
    const combined: DatabaseContextValue = {
      ready: actions.ready,
      refreshKey: version.refreshKey,
      refresh,
    };
    return (
      <DatabaseActionsContext.Provider value={actions}>
        <DatabaseVersionContext.Provider value={version}>
          <DatabaseContext.Provider value={combined}>{child}</DatabaseContext.Provider>
        </DatabaseVersionContext.Provider>
      </DatabaseActionsContext.Provider>
    );
  };

  const retryInit = useCallback(() => {
    void invalidateDatabase().then(() => {
      setError(null);
      setInitAttempt((a) => a + 1);
    });
  }, []);

  const reloadAfterRestore = useCallback(async (result: { success: boolean; message: string }) => {
    if (result.success) {
      await clearAllDrafts().catch((err) => console.warn('[boot] clear drafts after restore failed', err));
      setError(null);
      setRefreshKey((k) => k + 1);
      setInitAttempt((a) => a + 1);
    } else if (result.message !== 'Import cancelled') {
      setError(result.message);
    }
  }, []);

  const openImportModal = useCallback((mode: RestoreSource) => {
    setImportMode(mode);
    setImportConfirmInput('');
    setImportModalOpen(true);
  }, []);

  if (error) {
    return wrap(
        <DatabaseErrorUI
          error={error}
          onRetry={retryInit}
          showFolderRestore={isDeviceFolderBackupSupported()}
          showCloudRestore={cloudRestoreAvailable}
          onRestoreFromFolder={() => openImportModal('folder')}
          onRestoreFromFile={() => openImportModal('file')}
          onRestoreFromCloud={() => openImportModal('cloud')}
          importModalOpen={importModalOpen}
          importConfirmInput={importConfirmInput}
          importMode={importMode}
          onImportConfirmChange={setImportConfirmInput}
          onImportCancel={() => {
            if (restoring) return;
            setImportModalOpen(false);
            setImportConfirmInput('');
          }}
          restoring={restoring}
          onImportConfirm={async () => {
            if (importConfirmInput.trim().toUpperCase() !== IMPORT_CONFIRM_TEXT) return;
            setRestoring(true);
            try {
              const result =
                importMode === 'folder'
                  ? await restoreLatestFromBackupFolder()
                  : importMode === 'cloud'
                    ? await restoreDatabaseFromCloud()
                    : await restoreDatabaseFromBackup();
              await reloadAfterRestore(result);
              setImportModalOpen(false);
              setImportConfirmInput('');
            } catch (err) {
              setError(formatSqliteError(err));
            } finally {
              setRestoring(false);
            }
          }}
          onReset={() => {
            Alert.alert(
              'Reset database',
              'This permanently erases ALL data on this device. Only do this if restore from backup is not possible. Continue?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Erase everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await resetDatabase();
                      await clearAllDrafts().catch((err) =>
                        console.warn('[boot] clear drafts after reset failed', err)
                      );
                      setError(null);
                      setRefreshKey((k) => k + 1);
                      setInitAttempt((a) => a + 1);
                    } catch (err) {
                      setError(formatSqliteError(err));
                    }
                  },
                },
              ]
            );
          }}
        />,
      { ready: false }
    );
  }

  if (!ready) {
    return wrap(<AppBootScreen />, { ready: false });
  }

  return wrap(children);
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
      backgroundColor: colors.background,
    },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    errorText: { textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
    retryLink: { color: colors.primary, fontWeight: '700', marginBottom: spacing.md, fontSize: 15 },
    resetLink: { color: colors.danger, fontWeight: '600', fontSize: 14 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderRadius: radius.md,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
    modalCancel: { paddingVertical: spacing.sm },
  });
}

/** Combined hook — re-renders on refreshKey changes. Prefer split hooks when possible. */
export function useDatabase() {
  return useContext(DatabaseContext);
}

/** Stable actions — does not re-render when refreshKey bumps. */
export function useDatabaseActions() {
  return useContext(DatabaseActionsContext);
}

/** Version key only — subscribe when a screen must reload on data writes. */
export function useRefreshKey() {
  return useContext(DatabaseVersionContext).refreshKey;
}

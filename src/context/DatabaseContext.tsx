import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, AppState, Alert, InteractionManager, Modal, Pressable, TouchableOpacity } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppBootScreen } from '../components/AppBootScreen';
import { getDatabase, resetDatabase, invalidateDatabase, formatSqliteError } from '../db/database';
import { ensureLedgerUpToDate } from '../services/ledger';
import {
  backupOnBackground,
  runDailyBackupIfDue,
  restoreDatabaseFromBackup,
  restoreLatestFromBackupFolder,
} from '../services/backup';
import { processRecurringExpenses } from '../services/banking';
import { useTheme } from './ThemeContext';
import { spacing, radius } from '../constants/theme';
import { FormInput, PrimaryButton } from '../components/ui';

const IMPORT_CONFIRM_TEXT = 'IMPORT';

SplashScreen.preventAutoHideAsync().catch(() => {});

interface DatabaseContextValue {
  ready: boolean;
  refreshKey: number;
  refresh: () => void;
}

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
  onReset,
  importModalOpen,
  importConfirmInput,
  onImportConfirmChange,
  onImportConfirm,
  onImportCancel,
  restoring,
}: {
  error: string;
  onRetry: () => void;
  onRestoreFromFolder: () => void;
  onRestoreFromFile: () => void;
  onReset: () => void;
  importModalOpen: boolean;
  importConfirmInput: string;
  onImportConfirmChange: (value: string) => void;
  onImportConfirm: () => void;
  onImportCancel: () => void;
  restoring: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Could not open Hisab</Text>
      <Text style={styles.errorText}>{error}</Text>
      <Text style={styles.retryLink} onPress={onRetry}>
        Try again
      </Text>
      <Text style={styles.retryLink} onPress={onRestoreFromFolder}>
        Restore from backup folder
      </Text>
      <Text style={styles.retryLink} onPress={onRestoreFromFile}>
        Choose backup file
      </Text>
      <Text style={styles.resetLink} onPress={onReset}>
        Reset database (erases all data)
      </Text>

      <Modal visible={importModalOpen} transparent animationType="fade" onRequestClose={onImportCancel}>
        <Pressable style={styles.modalBackdrop} onPress={onImportCancel}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.errorTitle}>Import backup</Text>
            <Text style={styles.errorText}>
              This replaces all current data with the chosen backup file. Type {IMPORT_CONFIRM_TEXT} to
              confirm.
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
                  title="Choose file & import"
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
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let active = true;

    const boot = async (allowRetry: boolean) => {
      try {
        await getDatabase();
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
      ensureLedgerUpToDate().catch(() => {});
    });

    const recurringTimer = setTimeout(() => {
      processRecurringExpenses()
        .then((created) => {
          if (created > 0) setRefreshKey((k) => k + 1);
        })
        .catch(() => {});
    }, 1000);

    // Defer backup so DB + UI finish mounting first (avoids Android SAF native crashes).
    const backupTimer = setTimeout(() => {
      runDailyBackupIfDue().catch(() => {});
    }, 3000);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backupOnBackground().catch(() => {});
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

  const retryInit = useCallback(() => {
    void invalidateDatabase().then(() => {
      setError(null);
      setInitAttempt((a) => a + 1);
    });
  }, []);

  const reloadAfterRestore = useCallback((result: { success: boolean; message: string }) => {
    if (result.success) {
      setError(null);
      setRefreshKey((k) => k + 1);
      setInitAttempt((a) => a + 1);
    } else if (result.message !== 'Import cancelled') {
      setError(result.message);
    }
  }, []);

  if (error) {
    return (
      <DatabaseContext.Provider value={{ ready: false, refreshKey, refresh }}>
        <DatabaseErrorUI
          error={error}
          onRetry={retryInit}
          onRestoreFromFolder={() => {
            Alert.alert(
              'Restore from backup folder?',
              'This replaces all data on this device with the latest backup from your backup folder.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Restore',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      reloadAfterRestore(await restoreLatestFromBackupFolder());
                    } catch (err) {
                      setError(formatSqliteError(err));
                    }
                  },
                },
              ]
            );
          }}
          onRestoreFromFile={() => {
            setImportConfirmInput('');
            setImportModalOpen(true);
          }}
          importModalOpen={importModalOpen}
          importConfirmInput={importConfirmInput}
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
              reloadAfterRestore(await restoreDatabaseFromBackup());
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
        />
      </DatabaseContext.Provider>
    );
  }

  if (!ready) {
    return (
      <DatabaseContext.Provider value={{ ready: false, refreshKey, refresh }}>
        <AppBootScreen />
      </DatabaseContext.Provider>
    );
  }

  return (
    <DatabaseContext.Provider value={{ ready, refreshKey, refresh }}>
      {children}
    </DatabaseContext.Provider>
  );
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
      backgroundColor: 'rgba(0,0,0,0.45)',
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

export function useDatabase() {
  return useContext(DatabaseContext);
}

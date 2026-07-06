import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, AppState, Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppBootScreen } from '../components/AppBootScreen';
import { getDatabase, resetDatabase, invalidateDatabase, formatSqliteError } from '../db/database';
import {
  backupOnBackground,
  runDailyBackupIfDue,
  restoreDatabaseFromBackup,
  restoreLatestFromBackupFolder,
} from '../services/backup';
import { processRecurringExpenses } from '../services/banking';
import { useTheme } from './ThemeContext';
import { spacing } from '../constants/theme';

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
}: {
  error: string;
  onRetry: () => void;
  onRestoreFromFolder: () => void;
  onRestoreFromFile: () => void;
  onReset: () => void;
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
    </View>
  );
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);

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
  }, [ready]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const retryInit = useCallback(() => {
    setError(null);
    setInitAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    if (!ready) return;

    processRecurringExpenses().catch(() => {});

    // Defer backup so DB + UI finish mounting first (avoids Android SAF native crashes).
    const backupTimer = setTimeout(() => {
      runDailyBackupIfDue().catch(() => {});
    }, 3000);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runDailyBackupIfDue().catch(() => {});
      } else if (state === 'background' || state === 'inactive') {
        backupOnBackground().catch(() => {});
      }
    });

    return () => {
      clearTimeout(backupTimer);
      subscription.remove();
    };
  }, [ready]);

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
          onRestoreFromFolder={async () => {
            try {
              reloadAfterRestore(await restoreLatestFromBackupFolder());
            } catch (err) {
              setError(formatSqliteError(err));
            }
          }}
          onRestoreFromFile={async () => {
            try {
              reloadAfterRestore(await restoreDatabaseFromBackup());
            } catch (err) {
              setError(formatSqliteError(err));
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
  });
}

export function useDatabase() {
  return useContext(DatabaseContext);
}

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { getDatabase, resetDatabase, formatSqliteError } from '../db/database';
import { runDailyBackupIfDue } from '../services/backup';
import { useTheme } from './ThemeContext';
import { spacing } from '../constants/theme';

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

function DatabaseLoadingUI({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

function DatabaseErrorUI({
  error,
  onRetry,
  onReset,
}: {
  error: string;
  onRetry: () => void;
  onReset: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Database Error</Text>
      <Text style={styles.errorText}>{error}</Text>
      <Text style={styles.retryLink} onPress={onRetry}>
        Retry
      </Text>
      <Text style={styles.resetLink} onPress={onReset}>
        Reset Database (fresh start)
      </Text>
    </View>
  );
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setReady(false);

    getDatabase()
      .then(() => {
        if (active) {
          setReady(true);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setReady(false);
          setError(formatSqliteError(err));
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!ready) return;

    runDailyBackupIfDue().catch(() => {
      // Never block the app if auto-backup fails
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runDailyBackupIfDue().catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [ready]);

  if (error) {
    return (
      <DatabaseContext.Provider value={{ ready: false, refreshKey, refresh }}>
        <DatabaseErrorUI
          error={error}
          onRetry={() => {
            setError(null);
            refresh();
          }}
          onReset={async () => {
            try {
              await resetDatabase();
              setError(null);
              refresh();
            } catch (err) {
              setError(formatSqliteError(err));
            }
          }}
        />
      </DatabaseContext.Provider>
    );
  }

  if (!ready) {
    return (
      <DatabaseContext.Provider value={{ ready: false, refreshKey, refresh }}>
        <DatabaseLoadingUI message="Loading database..." />
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
    loadingText: { marginTop: 12, color: colors.textSecondary },
    errorTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
    errorText: { textAlign: 'center', color: colors.textSecondary, marginBottom: 16 },
    retryLink: { color: colors.primary, fontWeight: '700', marginBottom: 12, fontSize: 15 },
    resetLink: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  });
}

export function useDatabase() {
  return useContext(DatabaseContext);
}

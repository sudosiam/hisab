import { useEffect, useRef } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { DatabaseProvider } from '../src/context/DatabaseContext';
import { FinancialYearProvider } from '../src/context/FinancialYearContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { StatusBar } from 'expo-status-bar';
import { isAppUpdatesEnabled, reloadToApplyUpdate } from '../src/services/appUpdates';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

function PendingUpdatePrompt() {
  const { isUpdatePending } = Updates.useUpdates();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (!isAppUpdatesEnabled() || !isUpdatePending || promptedRef.current) return;
    promptedRef.current = true;
    Alert.alert(
      'Update downloaded',
      'Restart Hisab now to apply the latest fixes and improvements.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Restart now',
          onPress: () => {
            void reloadToApplyUpdate().catch((e) => {
              Alert.alert(
                'Could not restart',
                e instanceof Error ? e.message : 'Try closing and reopening Hisab.'
              );
            });
          },
        },
      ]
    );
  }, [isUpdatePending]);

  return null;
}

function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background }]}>
      {children}
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
        animationDuration: 220,
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedRoot>
          <ErrorBoundary>
            <DatabaseProvider>
              <FinancialYearProvider>
                <ThemedStatusBar />
                <PendingUpdatePrompt />
                <ErrorBoundary>
                  <ThemedStack />
                </ErrorBoundary>
              </FinancialYearProvider>
            </DatabaseProvider>
          </ErrorBoundary>
        </ThemedRoot>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

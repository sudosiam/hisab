import { useEffect } from 'react';
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

  useEffect(() => {
    if (!isAppUpdatesEnabled() || !isUpdatePending) return;
    Alert.alert('Update ready', 'A new version was downloaded. Restart now to apply it?', [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Restart',
        onPress: () => {
          void reloadToApplyUpdate();
        },
      },
    ]);
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
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
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

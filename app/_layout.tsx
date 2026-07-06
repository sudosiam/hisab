import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider } from '../src/context/DatabaseContext';
import { FinancialYearProvider } from '../src/context/FinancialYearContext';
import { AppLockProvider } from '../src/context/AppLockContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
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
            <AppLockProvider>
              <DatabaseProvider>
                <FinancialYearProvider>
                  <ThemedStatusBar />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
                </FinancialYearProvider>
              </DatabaseProvider>
            </AppLockProvider>
          </ErrorBoundary>
        </ThemedRoot>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

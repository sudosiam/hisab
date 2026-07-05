import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <ThemeProvider>
          <DatabaseProvider>
            <FinancialYearProvider>
              <AppLockProvider>
                <ThemedStatusBar />
                <Stack screenOptions={{ headerShown: false }} />
              </AppLockProvider>
            </FinancialYearProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

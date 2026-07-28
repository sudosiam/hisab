import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { spacing, radius, typography } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { ThemedPressable } from './ThemedPressable';
import { isAppUpdatesEnabled, reloadToApplyUpdate } from '../services/appUpdates';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  resetKey: number;
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const { colors } = useTheme();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        center: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.lg,
          backgroundColor: colors.background,
        },
        title: {
          ...typography.title,
          marginBottom: spacing.sm,
          color: colors.text,
          textAlign: 'center',
        },
        message: {
          ...typography.body,
          textAlign: 'center',
          marginBottom: spacing.lg,
          color: colors.textSecondary,
        },
        actions: {
          gap: spacing.sm,
          alignItems: 'center',
          width: '100%',
          maxWidth: 280,
        },
        btn: {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radius.full,
          backgroundColor: colors.primary,
          minHeight: 44,
          minWidth: 140,
          justifyContent: 'center',
          alignItems: 'center',
          alignSelf: 'stretch',
        },
        btnSecondary: {
          backgroundColor: colors.surfaceContainerHigh,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        btnText: {
          ...typography.bodyMedium,
          fontWeight: '600',
          color: colors.onPrimary,
          textAlign: 'center',
        },
        btnTextSecondary: {
          color: colors.text,
        },
      }),
    [colors]
  );

  const onRestart = () => {
    if (!isAppUpdatesEnabled()) {
      onReset();
      return;
    }
    void reloadToApplyUpdate().catch((e) => {
      Alert.alert(
        'Could not restart',
        e instanceof Error ? e.message : 'Try closing and reopening Hisab.'
      );
    });
  };

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>
        Hisab hit an unexpected error. You can try again, or restart the app.
      </Text>
      {__DEV__ ? <Text style={styles.message}>{error.message}</Text> : null}
      <View style={styles.actions}>
        <ThemedPressable
          style={styles.btn}
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.btnText}>Try again</Text>
        </ThemedPressable>
        <ThemedPressable
          style={[styles.btn, styles.btnSecondary]}
          onPress={onRestart}
          accessibilityRole="button"
          accessibilityLabel="Restart app"
        >
          <Text style={[styles.btnText, styles.btnTextSecondary]}>Restart app</Text>
        </ThemedPressable>
      </View>
    </View>
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  private reset = () => {
    this.setState((state) => ({
      error: null,
      resetKey: state.resetKey + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

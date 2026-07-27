import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, radius, typography } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { ThemedPressable } from './ThemedPressable';

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
        btn: {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radius.full,
          backgroundColor: colors.primary,
          minHeight: 44,
          minWidth: 140,
          justifyContent: 'center',
          alignItems: 'center',
        },
        btnText: {
          ...typography.bodyMedium,
          fontWeight: '600',
          color: colors.onPrimary,
          textAlign: 'center',
        },
      }),
    [colors]
  );

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error.message}</Text>
      <ThemedPressable
        style={styles.btn}
        onPress={onReset}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.btnText}>Try Again</Text>
      </ThemedPressable>
    </View>
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
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

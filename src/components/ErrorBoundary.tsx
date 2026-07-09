import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, radius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

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
        title: { fontSize: 18, fontWeight: '600', marginBottom: spacing.sm, color: colors.text },
        message: {
          fontSize: 14,
          textAlign: 'center',
          marginBottom: spacing.lg,
          color: colors.textSecondary,
          lineHeight: 20,
        },
        btn: {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
        },
        btnText: { fontSize: 15, fontWeight: '600', color: colors.onPrimary },
      }),
    [colors]
  );

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error.message}</Text>
      <TouchableOpacity style={styles.btn} onPress={onReset}>
        <Text style={styles.btnText}>Try Again</Text>
      </TouchableOpacity>
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

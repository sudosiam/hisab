import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing } from '../constants/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  resetKey: number;
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
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <TouchableOpacity style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  message: { fontSize: 14, textAlign: 'center', marginBottom: spacing.lg, opacity: 0.7 },
  btn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  btnText: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
});

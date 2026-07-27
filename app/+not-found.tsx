import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../src/context/ThemeContext';
import { spacing, typography } from '../src/constants/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>This screen doesn’t exist.</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          The link may be outdated, or the page was moved.
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Go to Dashboard</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  link: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  linkText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
});

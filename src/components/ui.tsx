import React, { useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface, fabShadow, primaryShadow } from '../constants/shadows';

export function createScreenStyles(colors: ThemeColors, isDark: boolean) {
  const surface = cardSurface(colors, isDark);

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xxl },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    section: { marginBottom: spacing.lg },
    sectionTitle: {
      ...typography.section,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    card: {
      ...surface,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardTitle: { ...typography.bodyMedium, color: colors.text, fontWeight: '600' },
    cardSub: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
    value: { ...typography.bodyMedium, color: colors.text },
    amount: { fontSize: 17, fontWeight: '700', color: colors.primary, letterSpacing: -0.3 },
    empty: {
      textAlign: 'center',
      color: colors.textSecondary,
      marginTop: 48,
      fontSize: 15,
      lineHeight: 22,
      paddingHorizontal: spacing.lg,
    },
    link: { color: colors.accent, fontWeight: '600', fontSize: 14 },
    divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.sm },
    filters: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
    list: { padding: spacing.md, paddingBottom: 96 },
    fab: {
      position: 'absolute',
      bottom: spacing.lg,
      right: spacing.lg,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: 15,
      borderRadius: radius.xl,
      ...fabShadow(isDark),
    },
    fabText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },
    dangerBtn: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.danger + '55',
      alignItems: 'center',
      backgroundColor: colors.surface,
      ...cardSurface(colors, isDark),
    },
    dangerText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
    infoBox: {
      marginTop: spacing.lg,
      padding: spacing.md,
      backgroundColor: colors.navActive,
      borderRadius: radius.lg,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
    },
  });
}

export function useScreenStyles() {
  const { colors, isDark } = useTheme();
  return useMemo(() => createScreenStyles(colors, isDark), [colors, isDark]);
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: ButtonProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createButtonStyles(colors, isDark), [colors, isDark]);

  const btnStyle =
    variant === 'danger'
      ? styles.danger
      : variant === 'secondary'
        ? styles.secondary
        : styles.primary;
  const textStyle =
    variant === 'danger'
      ? styles.dangerText
      : variant === 'secondary'
        ? styles.secondaryText
        : styles.primaryText;
  const spinnerColor =
    variant === 'secondary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : colors.onPrimary;

  return (
    <TouchableOpacity
      style={[btnStyle, (disabled || loading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

function createButtonStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    primary: {
      backgroundColor: colors.primary,
      paddingVertical: 15,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      marginVertical: spacing.xs,
      ...primaryShadow(isDark),
    },
    secondary: {
      backgroundColor: colors.surface,
      paddingVertical: 15,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      marginVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardSurface(colors, isDark),
    },
    danger: {
      backgroundColor: colors.surface,
      paddingVertical: 15,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      marginVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.danger + '44',
    },
    disabled: { opacity: 0.5 },
    primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
    secondaryText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    dangerText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  });
}

interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}

export function FormInput({ label, value, onChangeText, multiline, ...rest }: InputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createInputStyles(colors), [colors]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        {...rest}
      />
    </View>
  );
}

/**
 * Keyboard-aware wrapper for form screens: KeyboardAvoidingView + ScrollView
 * with taps kept alive so buttons work while the keyboard is open.
 */
export function FormScreen({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}) {
  const styles = useScreenStyles();
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Full-screen error state with a retry action, for failed screen loads. */
export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useScreenStyles();
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 15,
          textAlign: 'center',
          marginTop: spacing.md,
          marginBottom: spacing.md,
          paddingHorizontal: spacing.xl,
          lineHeight: 22,
        }}
      >
        {message || 'Something went wrong while loading this screen.'}
      </Text>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          activeOpacity={0.8}
          accessibilityLabel="Retry"
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.primary,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 14 }}>
            Try Again
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createInputStyles(colors: ThemeColors) {
  return StyleSheet.create({
    field: { marginBottom: spacing.md },
    label: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 13,
      backgroundColor: colors.inputBg,
      fontSize: 15,
      color: colors.text,
    },
    multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 13 },
  });
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function FilterChip({ label, active, onPress }: FilterChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createChipStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FilterRow({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
      }}
    >
      {children}
    </View>
  );
}

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search...',
}: SearchFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: spacing.md,
          marginBottom: spacing.sm,
          marginTop: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.inputBg,
        },
        input: {
          flex: 1,
          fontSize: 15,
          color: colors.text,
          paddingVertical: 0,
        },
        clear: { padding: 4, marginLeft: spacing.xs },
      }),
    [colors]
  );

  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clear} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createChipStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.chip,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.chipActive,
      borderColor: colors.chipActive,
    },
    chipText: { fontSize: 13, color: colors.chipText, fontWeight: '600' },
    chipTextActive: { color: colors.chipTextActive, fontWeight: '700' },
  });
}

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, onPress, style }: CardProps) {
  const { colors, isDark } = useTheme();
  const base: ViewStyle = {
    ...cardSurface(colors, isDark),
    padding: spacing.md,
    marginBottom: spacing.sm,
  };

  if (onPress) {
    return (
      <TouchableOpacity style={[base, style]} onPress={onPress} activeOpacity={0.7}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        ...typography.section,
        color: colors.textMuted,
        textTransform: 'uppercase',
        marginBottom: spacing.sm,
        marginTop: spacing.md,
      }}
    >
      {title}
    </Text>
  );
}

export function ThemeOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemeOptionStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.optionActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.optionText, selected && styles.optionTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function createThemeOptionStyles(colors: ThemeColors) {
  return StyleSheet.create({
    option: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionActive: {
      backgroundColor: colors.navActive,
      borderColor: colors.primary,
    },
    optionText: { fontSize: 13, fontWeight: '600', color: colors.text },
    optionTextActive: { color: colors.primary, fontWeight: '700' },
  });
}

export function ListRow({
  left,
  right,
  subtitle,
  style,
}: {
  left: string;
  right?: string | React.ReactNode;
  subtitle?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        style,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: colors.text, fontWeight: '500' }}>{left}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      {typeof right === 'string' ? (
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{right}</Text>
      ) : (
        right
      )}
    </View>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ ...typography.display, color: colors.text }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 20 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useScreenStyles();
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.fabText}>{label}</Text>
    </TouchableOpacity>
  );
}

interface ShortcutItem {
  label: string;
  route: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const DASHBOARD_SHORTCUTS: ShortcutItem[] = [
  { label: 'New Sale', route: '/(drawer)/sales/new', icon: 'cart-outline' },
  { label: 'Purchase', route: '/(drawer)/purchases/new', icon: 'bag-handle-outline' },
  { label: 'Expense', route: '/(drawer)/expense', icon: 'receipt-outline' },
  { label: 'Product', route: '/(drawer)/inventory/new', icon: 'cube-outline' },
];

export function DashboardShortcuts() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createShortcutStyles(colors, isDark), [colors, isDark]);

  return (
    <View>
      <Text style={styles.heading}>Quick Actions</Text>
      <View style={styles.row}>
        {DASHBOARD_SHORTCUTS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.item}
            onPress={() => router.navigate(item.route as never)}
            activeOpacity={0.75}
            accessibilityLabel={item.label}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.itemLabel} numberOfLines={1}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function createShortcutStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    heading: {
      ...typography.section,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrap: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: colors.navActive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
}

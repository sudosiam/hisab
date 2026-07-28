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
import { NumericKeyboardAccessory, NUMERIC_KEYBOARD_ACCESSORY_ID } from './NumericKeyboardAccessory';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface, elevatedSurface, fabShadow } from '../constants/shadows';
import { MoneyText } from './MoneyText';
import { StatCard } from './StatCard';
import type { DashboardStats } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedPressable, ACTIVE_OPACITY } from './ThemedPressable';
import { AnimatedScreenBody } from './AnimatedPresence';

export { ThemedPressable, ACTIVE_OPACITY };
export const ICON = { nav: 20, inline: 18, chevron: 16 } as const;

export { DatePickerField } from './DatePickerField';

export function createScreenStyles(colors: ThemeColors, isDark: boolean) {
  const surface = cardSurface(colors, isDark);

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
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
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
      minHeight: 52,
      justifyContent: 'center',
    },
    /** Compact summary / net-worth hero used on finance screens. */
    heroCard: {
      ...elevatedSurface(colors, isDark),
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
    },
    cardTitle: { ...typography.bodyMedium, color: colors.text, fontWeight: '600' },
    cardSub: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    detailKpiRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginVertical: spacing.md,
    },
    label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
    value: { ...typography.bodyMedium, color: colors.text },
    amount: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.3,
      fontVariant: ['tabular-nums'],
    },
    empty: {
      textAlign: 'center',
      color: colors.textSecondary,
      marginTop: spacing.lg,
      ...typography.body,
      paddingHorizontal: spacing.lg,
    },
    link: { color: colors.accent, fontWeight: '600', fontSize: 13 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderLight,
      marginVertical: spacing.sm,
    },
    filters: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    list: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: 112,
    },
    fab: {
      position: 'absolute',
      bottom: spacing.lg,
      right: spacing.lg,
      backgroundColor: colors.primaryContainer,
      width: 56,
      height: 56,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      ...fabShadow(isDark, colors.shadow),
    },
    fabText: { color: colors.onPrimaryContainer, fontWeight: '600', fontSize: 12 },
    dangerBtn: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.danger + '55',
      alignItems: 'center',
      backgroundColor: colors.surface,
      minHeight: 44,
      justifyContent: 'center',
    },
    dangerText: { color: colors.danger, fontWeight: '600', fontSize: 14 },
    infoBox: {
      marginTop: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.primaryContainer,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
  });
}

export function useScreenStyles() {
  const { colors, isDark } = useTheme();
  return useMemo(() => createScreenStyles(colors, isDark), [colors, isDark]);
}

/** Bottom padding for FlatList content when a FAB is present (112 + safe area). */
export function useFabListPadding(base = 112): number {
  const insets = useSafeAreaInsets();
  return base + insets.bottom;
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
      ? colors.onPrimaryContainer
      : variant === 'danger'
        ? colors.danger
        : colors.onPrimary;

  return (
    <ThemedPressable
      style={[btnStyle, (disabled || loading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      haptic={variant === 'danger' ? 'warning' : 'light'}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: !!loading }}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </ThemedPressable>
  );
}

function createButtonStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    primary: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      minHeight: 44,
      marginVertical: spacing.xs,
    },
    secondary: {
      backgroundColor: colors.primaryContainer,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      minHeight: 44,
      marginVertical: spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    danger: {
      backgroundColor: 'transparent',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      minHeight: 44,
      marginVertical: spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.danger : colors.danger + '99',
    },
    disabled: { opacity: 0.5 },
    primaryText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
    },
    secondaryText: {
      color: colors.onPrimaryContainer,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
    },
    dangerText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
    },
  });
}

export function FinanceHero({
  stats,
  amountsHidden = false,
  periodLabel,
  onToggleAmountsHidden,
  onNetWorthPress,
  onCashPress,
  onReceivablePress,
  onPayablePress,
  onInventoryPress,
  onProfitPress,
  onRevenuePress,
  onPurchasedPress,
  onOtherIncomePress,
  onExpensesPress,
}: {
  stats: DashboardStats;
  amountsHidden?: boolean;
  /** Period title for P&L cells, e.g. "This Month · Cash". */
  periodLabel?: string;
  onToggleAmountsHidden?: () => void;
  onNetWorthPress?: () => void;
  onCashPress?: () => void;
  onReceivablePress?: () => void;
  onPayablePress?: () => void;
  onInventoryPress?: () => void;
  onProfitPress?: () => void;
  onRevenuePress?: () => void;
  onPurchasedPress?: () => void;
  onOtherIncomePress?: () => void;
  onExpensesPress?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          gap: spacing.md,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          minHeight: 28,
        },
        headerTitle: {
          flex: 1,
          minWidth: 0,
        },
        eyeBtn: {
          width: 40,
          height: 40,
          marginTop: -6,
          marginRight: -6,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
        },
        matrix: {
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: colors.surfaceContainer,
        },
        matrixRow: {
          flexDirection: 'row',
          alignItems: 'stretch',
        },
        vRule: {
          width: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          alignSelf: 'stretch',
        },
        hRule: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
        },
      }),
    [colors, isDark]
  );

  const netProfitColor = stats.netProfit >= 0 ? colors.success : colors.danger;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <SectionHeader title={periodLabel ?? 'This period'} tight />
        </View>
        {onToggleAmountsHidden ? (
          <ThemedPressable
            style={styles.eyeBtn}
            onPress={onToggleAmountsHidden}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={amountsHidden ? 'Show amounts' : 'Hide amounts'}
            android_ripple={{ color: colors.overlay, borderless: true, radius: 20 }}
          >
            <Ionicons
              name={amountsHidden ? 'eye-off-outline' : 'eye-outline'}
              size={ICON.inline}
              color={colors.textSecondary}
            />
          </ThemedPressable>
        ) : null}
      </View>

      <View style={styles.matrix}>
        <View style={styles.matrixRow}>
          <StatCard
            equal
            variant="matrix"
            icon="trending-up-outline"
            label="Net profit"
            value={stats.netProfit}
            color={netProfitColor}
            valueColor={netProfitColor}
            onPress={onProfitPress}
            blurred={amountsHidden}
          />
          <View style={styles.vRule} />
          <StatCard
            equal
            variant="matrix"
            icon="stats-chart-outline"
            label="Gross profit"
            value={stats.grossProfit}
            color={colors.primary}
            onPress={onProfitPress}
            blurred={amountsHidden}
          />
        </View>
        <View style={styles.hRule} />
        <View style={styles.matrixRow}>
          <StatCard
            equal
            variant="matrix"
            icon="cart-outline"
            label="Revenue"
            value={stats.sold}
            color={colors.primary}
            onPress={onRevenuePress}
            blurred={amountsHidden}
          />
          <View style={styles.vRule} />
          <StatCard
            equal
            variant="matrix"
            icon="bag-handle-outline"
            label="Purchases"
            value={stats.purchased}
            color={colors.warning}
            onPress={onPurchasedPress}
            blurred={amountsHidden}
          />
        </View>
        <View style={styles.hRule} />
        <View style={styles.matrixRow}>
          <StatCard
            equal
            variant="matrix"
            icon="cash-outline"
            label="Other income"
            value={stats.otherIncome}
            color={colors.success}
            onPress={onOtherIncomePress}
            blurred={amountsHidden}
          />
          <View style={styles.vRule} />
          <StatCard
            equal
            variant="matrix"
            icon="receipt-outline"
            label="Expenses"
            value={stats.expense}
            color={colors.danger}
            onPress={onExpensesPress}
            blurred={amountsHidden}
          />
        </View>
      </View>

      <SectionHeader title="Balances now" tight />

      <View style={styles.matrix}>
        <StatCard
          equal
          variant="matrix"
          icon="pie-chart-outline"
          label="Net worth"
          value={stats.netWorth}
          color={colors.primary}
          onPress={onNetWorthPress}
          blurred={amountsHidden}
        />
      </View>

      <View style={styles.matrix}>
        <View style={styles.matrixRow}>
          <StatCard
            equal
            variant="matrix"
            icon="wallet-outline"
            label="Cash & bank"
            value={stats.totalLiquid}
            color={colors.primary}
            onPress={onCashPress}
            blurred={amountsHidden}
          />
          <View style={styles.vRule} />
          <StatCard
            equal
            variant="matrix"
            icon="arrow-down-circle-outline"
            label="Receivable"
            value={stats.receivable}
            color={colors.danger}
            onPress={onReceivablePress}
            blurred={amountsHidden}
          />
        </View>
        <View style={styles.hRule} />
        <View style={styles.matrixRow}>
          <StatCard
            equal
            variant="matrix"
            icon="arrow-up-circle-outline"
            label="Payable"
            value={stats.payable}
            color={colors.warning}
            onPress={onPayablePress}
            blurred={amountsHidden}
          />
          <View style={styles.vRule} />
          <StatCard
            equal
            variant="matrix"
            icon="cube-outline"
            label="Inventory"
            value={stats.inventoryValue}
            color={colors.primaryLight}
            onPress={onInventoryPress}
            blurred={amountsHidden}
          />
        </View>
      </View>
    </View>
  );
}

export function AmountText({
  amount,
  style,
  color,
}: {
  amount: number;
  style?: import('react-native').TextStyle;
  color?: string;
}) {
  return <MoneyText amount={amount} size="lg" color={color} style={style} />;
}

interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  helperText?: string;
  /** Inline validation message — shows under the field in danger color. */
  error?: string;
  /** Money field: decimal pad, 0.00 placeholder, tabular digits. */
  money?: boolean;
  /** Quantity field: decimal pad, tabular digits (placeholder defaults to 0). */
  qty?: boolean;
}

export function FormInput({
  label,
  value,
  onChangeText,
  multiline,
  helperText,
  error,
  editable,
  money,
  qty,
  placeholder,
  keyboardType,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createInputStyles(colors), [colors]);
  const isReadOnly = editable === false;
  const isNumeric = money || qty;
  const showError = Boolean(error?.trim());
  const supportText = showError ? error!.trim() : helperText;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multiline,
          isReadOnly && styles.inputDisabled,
          isNumeric && styles.moneyInput,
          showError && styles.inputError,
        ]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        editable={editable}
        placeholder={placeholder ?? (money ? '0.00' : qty ? '0' : undefined)}
        keyboardType={keyboardType ?? (isNumeric ? 'decimal-pad' : undefined)}
        inputAccessoryViewID={
          Platform.OS === 'ios' && isNumeric ? NUMERIC_KEYBOARD_ACCESSORY_ID : undefined
        }
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        accessibilityState={{ disabled: isReadOnly }}
        {...rest}
      />
      {supportText ? (
        <Text style={showError ? styles.errorText : styles.helperText}>{supportText}</Text>
      ) : null}
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
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxl + Math.max(insets.bottom, spacing.md) },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Avoid double-inset with KeyboardAvoidingView padding on iOS.
        automaticallyAdjustKeyboardInsets={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedScreenBody>{children}</AnimatedScreenBody>
        <NumericKeyboardAccessory />
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
    <AnimatedScreenBody style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 14,
          textAlign: 'center',
          marginTop: spacing.md,
          marginBottom: spacing.md,
          paddingHorizontal: spacing.xl,
          lineHeight: 20,
        }}
      >
        {message || 'Something went wrong while loading this screen.'}
      </Text>
      {onRetry ? (
        <ThemedPressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.primary,
            minHeight: 44,
            minWidth: 140,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: colors.onPrimary,
              fontWeight: '600',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            Try Again
          </Text>
        </ThemedPressable>
      ) : null}
    </AnimatedScreenBody>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useScreenStyles();
  return (
    <AnimatedScreenBody
      style={{
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xl,
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.full,
          backgroundColor: colors.surfaceContainerHigh,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xs,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        <Ionicons name="file-tray-outline" size={28} color={colors.textSecondary} />
      </View>
      <Text style={[styles.cardTitle, { textAlign: 'center' }]}>{title}</Text>
      {message ? (
        <Text style={[styles.empty, { marginTop: 0 }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <ThemedPressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={{
            marginTop: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.primary,
            minHeight: 44,
            minWidth: 140,
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
          }}
        >
          <Text
            style={{
              color: colors.onPrimary,
              fontWeight: '600',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            {actionLabel}
          </Text>
        </ThemedPressable>
      ) : null}
    </AnimatedScreenBody>
  );
}

function createInputStyles(colors: ThemeColors) {
  return StyleSheet.create({
    field: { marginBottom: spacing.md },
    label: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      backgroundColor: colors.inputBg,
      fontSize: 14,
      color: colors.text,
      minHeight: 44,
    },
    multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: 11 },
    inputDisabled: { backgroundColor: colors.surfaceContainerHigh, color: colors.textSecondary },
    inputError: {
      borderColor: colors.danger,
      borderWidth: 1,
    },
    moneyInput: { fontVariant: ['tabular-nums'] },
    helperText: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      marginTop: spacing.xs,
    },
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
    <ThemedPressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text
        style={[styles.chipText, active && styles.chipTextActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </ThemedPressable>
  );
}

export function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
        flexWrap: 'wrap',
        alignItems: 'center',
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
          marginBottom: spacing.xs + 2,
          marginTop: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          minHeight: 44,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.inputBg,
        },
        input: {
          flex: 1,
          fontSize: 14,
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
        accessibilityLabel={placeholder}
      />
      {value ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          style={styles.clear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
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
      minWidth: 0,
      paddingVertical: 8,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: colors.chip,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    chipActive: {
      backgroundColor: colors.chipActive,
      borderColor: colors.border,
    },
    chipText: {
      fontSize: 11,
      color: colors.chipText,
      fontWeight: '500',
      textAlign: 'center',
    },
    chipTextActive: { color: colors.chipTextActive, fontWeight: '600' },
  });
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createChipStyles(colors), [colors]);

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <ThemedPressable
            key={option.value}
            style={[styles.chip, active && styles.chipActive, { flex: 1, minHeight: 44 }]}
            onPress={() => {
              if (option.value !== value) onChange(option.value);
            }}
            activeOpacity={ACTIVE_OPACITY}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[styles.chipText, active && styles.chipTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {option.label}
            </Text>
          </ThemedPressable>
        );
      })}
    </View>
  );
}

export function SummaryHero({
  label,
  amount,
  hint,
  secondary,
}: {
  label: string;
  amount: number;
  hint?: string;
  secondary?: { label: string; amount: number; color?: string }[];
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...elevatedSurface(colors, isDark),
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginBottom: spacing.md,
          alignItems: 'center',
        },
        label: {
          ...typography.section,
          color: colors.textMuted,
          textTransform: 'uppercase',
          marginBottom: spacing.xs,
        },
        hint: {
          ...typography.caption,
          color: colors.textMuted,
          marginTop: spacing.xs,
          textAlign: 'center',
        },
        secondaryRow: {
          flexDirection: 'row',
          marginTop: spacing.md,
          gap: spacing.md,
          width: '100%',
        },
        secondaryItem: {
          flex: 1,
          minWidth: 0,
          alignItems: 'center',
        },
        secondaryLabel: {
          ...typography.caption,
          color: colors.textSecondary,
          marginBottom: 2,
          textAlign: 'center',
        },
      }),
    [colors, isDark]
  );

  return (
    <View style={styles.hero}>
      <Text style={styles.label}>{label}</Text>
      <MoneyText amount={amount} size="hero" style={{ textAlign: 'center', width: '100%' }} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {secondary && secondary.length > 0 ? (
        <View style={styles.secondaryRow}>
          {secondary.map((item) => (
            <View key={item.label} style={styles.secondaryItem}>
              <Text style={styles.secondaryLabel}>{item.label}</Text>
              <MoneyText
                amount={item.amount}
                size="md"
                color={item.color}
                style={{ textAlign: 'center', width: '100%' }}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
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
      <TouchableOpacity
        style={[base, style]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  tight,
}: {
  title: string;
  /** Skip top margin when the parent already spaces the block. */
  tight?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        ...typography.section,
        color: colors.textMuted,
        textTransform: 'uppercase',
        marginBottom: spacing.xs,
        marginTop: tight ? 0 : spacing.md,
        letterSpacing: 0.4,
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
    <ThemedPressable
      style={[styles.option, selected && styles.optionActive]}
      onPress={onPress}
      activeOpacity={ACTIVE_OPACITY}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.optionText, selected && styles.optionTextActive]}>{label}</Text>
    </ThemedPressable>
  );
}

function createThemeOptionStyles(colors: ThemeColors) {
  return StyleSheet.create({
    option: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: spacing.xs,
      alignItems: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.surfaceContainer,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      minHeight: 44,
      justifyContent: 'center',
    },
    optionActive: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.border,
    },
    optionText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
      textAlign: 'center',
    },
    optionTextActive: { color: colors.onPrimaryContainer, fontWeight: '600' },
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
          minHeight: 44,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, marginRight: spacing.sm }}>
        <Text style={{ fontSize: 14, color: colors.text, fontWeight: '500' }} numberOfLines={2}>
          {left}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof right === 'string' ? (
        <MoneyText amount={0} text={right} size="md" />
      ) : (
        right
      )}
    </View>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ ...typography.display, color: colors.text }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Infer a Material FAB icon from common action labels. */
function fabIconForLabel(label: string): React.ComponentProps<typeof Ionicons>['name'] {
  const lower = label.toLowerCase();
  if (lower.includes('sale')) return 'cart-outline';
  if (lower.includes('purchase')) return 'bag-handle-outline';
  if (lower.includes('expense')) return 'receipt-outline';
  if (lower.includes('income')) return 'cash-outline';
  if (lower.includes('product') || lower.includes('item')) return 'cube-outline';
  if (lower.includes('party') || lower.includes('customer') || lower.includes('vendor')) {
    return 'person-add-outline';
  }
  if (lower.includes('account') || lower.includes('bank')) return 'wallet-outline';
  if (lower.includes('transfer')) return 'swap-horizontal-outline';
  return 'add';
}

export function Fab({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const iconName = icon ?? fabIconForLabel(label);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        fab: {
          position: 'absolute',
          bottom: spacing.lg + insets.bottom,
          right: spacing.lg,
          backgroundColor: colors.primaryContainer,
          minHeight: 56,
          paddingHorizontal: spacing.md,
          borderRadius: radius.full,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          ...fabShadow(isDark, colors.shadow),
        },
        text: {
          color: colors.onPrimaryContainer,
          fontWeight: '600',
          fontSize: 13,
          maxWidth: 100,
        },
      }),
    [colors, isDark, insets.bottom]
  );

  return (
    <ThemedPressable
      style={styles.fab}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={iconName} size={22} color={colors.onPrimaryContainer} />
      <Text style={styles.text} numberOfLines={1}>
        {label.replace(/^\+\s*/, '')}
      </Text>
    </ThemedPressable>
  );
}

interface ShortcutItem {
  label: string;
  route: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const FINANCE_SHORTCUTS: ShortcutItem[] = [
  { label: 'P & L', route: '/(drawer)/reports/profit-loss', icon: 'trending-up-outline' },
  { label: 'Balance Sheet', route: '/(drawer)/balance-sheet', icon: 'scale-outline' },
  { label: 'Transfer', route: '/(drawer)/banking/transfer', icon: 'swap-horizontal-outline' },
  { label: 'Banking', route: '/(drawer)/banking', icon: 'wallet-outline' },
];

const OPS_SHORTCUTS: ShortcutItem[] = [
  { label: 'New Sale', route: '/(drawer)/sales/new', icon: 'cart-outline' },
  { label: 'Purchase', route: '/(drawer)/purchases/new', icon: 'bag-handle-outline' },
  { label: 'Payment', route: '/(drawer)/payments/new', icon: 'cash-outline' },
  { label: 'Expense', route: '/(drawer)/expense/new', icon: 'receipt-outline' },
];

function ShortcutRow({
  title,
  items,
  styles,
  colors,
  router,
}: {
  title: string;
  items: ShortcutItem[];
  styles: ReturnType<typeof createShortcutStyles>;
  colors: ThemeColors;
  router: ReturnType<typeof useRouter>;
}) {
  const rows: ShortcutItem[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }

  return (
    <View style={styles.section}>
      <SectionHeader title={title} tight />
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row.map((i) => i.route).join('|')} style={styles.row}>
            {row.map((item) => (
              <ThemedPressable
                key={item.route}
                style={styles.button}
                onPress={() => router.push(item.route as never)}
                activeOpacity={ACTIVE_OPACITY}
                accessibilityLabel={item.label}
                accessibilityRole="button"
              >
                <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
                <Text style={styles.itemLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </ThemedPressable>
            ))}
            {row.length === 1 ? <View style={styles.buttonSpacer} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function DashboardShortcuts() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createShortcutStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.wrap}>
      <ShortcutRow
        title="Trading"
        items={OPS_SHORTCUTS}
        styles={styles}
        colors={colors}
        router={router}
      />
      <ShortcutRow
        title="Books"
        items={FINANCE_SHORTCUTS}
        styles={styles}
        colors={colors}
        router={router}
      />
    </View>
  );
}

function createShortcutStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.md,
    },
    section: {
      gap: spacing.sm,
    },
    grid: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    button: {
      flex: 1,
      minHeight: 48,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainer,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
    },
    buttonSpacer: {
      flex: 1,
    },
    itemLabel: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.text,
      flexShrink: 1,
    },
  });
}

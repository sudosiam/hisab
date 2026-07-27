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
import { formatCurrency } from '../utils/format';
import { MoneyText } from './MoneyText';
import type { DashboardStats } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedPressable, ACTIVE_OPACITY } from './ThemedPressable';

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
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    card: {
      ...surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginBottom: spacing.sm,
      minHeight: 56,
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
      borderWidth: isDark ? 1 : 0,
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
      borderRadius: radius.full,
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
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      minHeight: 44,
      marginVertical: spacing.xs,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
    },
    danger: {
      backgroundColor: 'transparent',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      minHeight: 44,
      marginVertical: spacing.xs,
      borderWidth: 1,
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
  onToggleAmountsHidden,
  onNetWorthPress,
  onCashPress,
  onReceivablePress,
  onPayablePress,
  onInventoryPress,
}: {
  stats: DashboardStats;
  amountsHidden?: boolean;
  onToggleAmountsHidden?: () => void;
  onNetWorthPress?: () => void;
  onCashPress?: () => void;
  onReceivablePress?: () => void;
  onPayablePress?: () => void;
  onInventoryPress?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          ...elevatedSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.md,
          overflow: 'hidden',
          gap: spacing.md,
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        },
        kicker: {
          ...typography.section,
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        },
        eyeBtn: {
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
          backgroundColor: colors.surfaceContainerHigh,
        },
        profitBlock: {
          gap: 4,
        },
        profitLabel: {
          ...typography.caption,
          color: colors.textSecondary,
          fontWeight: '500',
        },
        grossLine: {
          ...typography.caption,
          color: colors.textMuted,
          marginTop: 2,
        },
        worthRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          minHeight: 52,
          backgroundColor: colors.surfaceContainerHigh,
          borderRadius: radius.md,
          borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
        },
        worthLeft: { flex: 1, minWidth: 0, gap: 2 },
        worthLabel: {
          ...typography.micro,
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          fontWeight: '600',
        },
        tileGrid: {
          gap: spacing.sm,
        },
        tileRow: {
          flexDirection: 'row',
          gap: spacing.sm,
        },
        tile: {
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'stretch',
          overflow: 'hidden',
          backgroundColor: colors.surfaceContainerHigh,
          borderRadius: radius.md,
          borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          minHeight: 68,
        },
        tileAccent: {
          width: 3,
          alignSelf: 'stretch',
        },
        tileBody: {
          flex: 1,
          minWidth: 0,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          justifyContent: 'center',
          gap: 4,
        },
        tileLabelRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        tileLabel: {
          ...typography.micro,
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          fontWeight: '600',
          flexShrink: 1,
        },
      }),
    [colors, isDark]
  );

  const netProfitColor = stats.netProfit >= 0 ? colors.success : colors.danger;

  const tiles: {
    label: string;
    amount: number;
    color: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    onPress?: () => void;
    a11y: string;
  }[] = [
    {
      label: 'Cash & Bank',
      amount: stats.totalLiquid,
      color: colors.primary,
      icon: 'wallet-outline',
      onPress: onCashPress,
      a11y: 'View banking',
    },
    {
      label: 'Receivable',
      amount: stats.receivable,
      color: colors.danger,
      icon: 'arrow-down-circle-outline',
      onPress: onReceivablePress,
      a11y: 'View receivables',
    },
    {
      label: 'Payable',
      amount: stats.payable,
      color: colors.warning,
      icon: 'arrow-up-circle-outline',
      onPress: onPayablePress,
      a11y: 'View payables',
    },
    {
      label: 'Inventory',
      amount: stats.inventoryValue,
      color: colors.primaryLight,
      icon: 'cube-outline',
      onPress: onInventoryPress,
      a11y: 'View inventory',
    },
  ];

  return (
    <View style={styles.hero}>
      <View style={styles.topBar}>
        <Text style={styles.kicker}>This period</Text>
        {onToggleAmountsHidden ? (
          <ThemedPressable
            style={styles.eyeBtn}
            onPress={onToggleAmountsHidden}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={amountsHidden ? 'Show amounts' : 'Hide amounts'}
            android_ripple={{ color: colors.overlay, borderless: true, radius: 22 }}
          >
            <Ionicons
              name={amountsHidden ? 'eye-off-outline' : 'eye-outline'}
              size={ICON.inline}
              color={colors.textSecondary}
            />
          </ThemedPressable>
        ) : null}
      </View>

      <View style={styles.profitBlock}>
        <Text style={styles.profitLabel}>Net profit</Text>
        <MoneyText
          amount={stats.netProfit}
          size="hero"
          color={netProfitColor}
          style={{ width: '100%', textAlign: 'left' }}
          blurred={amountsHidden}
          lines={1}
        />
        <Text style={styles.grossLine} numberOfLines={1}>
          Gross{' '}
          {amountsHidden ? (
            <Text style={{ letterSpacing: 1.5, opacity: 0.45 }}>••••••</Text>
          ) : (
            formatCurrency(stats.grossProfit)
          )}
        </Text>
      </View>

      <ThemedPressable
        style={styles.worthRow}
        onPress={onNetWorthPress}
        disabled={!onNetWorthPress}
        haptic={onNetWorthPress ? 'light' : false}
        accessibilityRole={onNetWorthPress ? 'button' : undefined}
        accessibilityLabel="View balance sheet"
      >
        <View style={styles.worthLeft}>
          <Text style={styles.worthLabel}>Net worth</Text>
          <MoneyText
            amount={stats.netWorth}
            size="lg"
            style={{ width: '100%', textAlign: 'left' }}
            blurred={amountsHidden}
            lines={1}
          />
        </View>
        {onNetWorthPress ? (
          <Ionicons name="chevron-forward" size={ICON.chevron} color={colors.textMuted} />
        ) : null}
      </ThemedPressable>

      <View style={styles.tileGrid}>
        <View style={styles.tileRow}>
          {tiles.slice(0, 2).map((tile) => (
            <ThemedPressable
              key={tile.label}
              style={styles.tile}
              onPress={tile.onPress}
              disabled={!tile.onPress}
              haptic={tile.onPress ? 'light' : false}
              accessibilityRole={tile.onPress ? 'button' : undefined}
              accessibilityLabel={tile.a11y}
            >
              <View style={[styles.tileAccent, { backgroundColor: tile.color }]} />
              <View style={styles.tileBody}>
                <View style={styles.tileLabelRow}>
                  <Ionicons name={tile.icon} size={14} color={tile.color} />
                  <Text style={styles.tileLabel} numberOfLines={1}>
                    {tile.label}
                  </Text>
                </View>
                <MoneyText
                  amount={tile.amount}
                  size="md"
                  color={colors.text}
                  style={{ width: '100%', textAlign: 'left' }}
                  blurred={amountsHidden}
                  lines={1}
                />
              </View>
            </ThemedPressable>
          ))}
        </View>
        <View style={styles.tileRow}>
          {tiles.slice(2, 4).map((tile) => (
            <ThemedPressable
              key={tile.label}
              style={styles.tile}
              onPress={tile.onPress}
              disabled={!tile.onPress}
              haptic={tile.onPress ? 'light' : false}
              accessibilityRole={tile.onPress ? 'button' : undefined}
              accessibilityLabel={tile.a11y}
            >
              <View style={[styles.tileAccent, { backgroundColor: tile.color }]} />
              <View style={styles.tileBody}>
                <View style={styles.tileLabelRow}>
                  <Ionicons name={tile.icon} size={14} color={tile.color} />
                  <Text style={styles.tileLabel} numberOfLines={1}>
                    {tile.label}
                  </Text>
                </View>
                <MoneyText
                  amount={tile.amount}
                  size="md"
                  color={colors.text}
                  style={{ width: '100%', textAlign: 'left' }}
                  blurred={amountsHidden}
                  lines={1}
                />
              </View>
            </ThemedPressable>
          ))}
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
        {children}
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
    <View style={styles.center}>
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
            borderRadius: radius.full,
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
    </View>
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
    <View
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
            borderRadius: radius.full,
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
    </View>
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
      borderColor: 'transparent',
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
          borderRadius: radius.full,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceContainerHigh,
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
      borderRadius: radius.full,
      backgroundColor: colors.chip,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    chipActive: {
      backgroundColor: colors.chipActive,
      borderColor: colors.chipActive,
    },
    chipText: {
      fontSize: 11,
      color: colors.chipText,
      fontWeight: '500',
      textAlign: 'center',
    },
    chipTextActive: { color: colors.chipTextActive, fontWeight: '700' },
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
          color: colors.textSecondary,
          textTransform: 'uppercase',
          marginBottom: spacing.xs,
        },
        hint: {
          ...typography.caption,
          color: colors.textSecondary,
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
        color: colors.textSecondary,
        textTransform: 'uppercase',
        marginBottom: spacing.xs,
        marginTop: tight ? 0 : spacing.md,
        letterSpacing: 0.5,
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
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainer,
      minHeight: 44,
      justifyContent: 'center',
    },
    optionActive: {
      backgroundColor: colors.primaryContainer,
    },
    optionText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
      textAlign: 'center',
    },
    optionTextActive: { color: colors.onPrimaryContainer, fontWeight: '700' },
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
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>{title}</Text>
      <View style={styles.row}>
        {items.map((item) => (
          <ThemedPressable
            key={item.route}
            style={styles.item}
            onPress={() => router.push(item.route as never)}
            accessibilityLabel={item.label}
            accessibilityRole="button"
          >
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={ICON.inline} color={colors.onPrimaryContainer} />
            </View>
            <Text style={styles.itemLabel} numberOfLines={1}>
              {item.label}
            </Text>
          </ThemedPressable>
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
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      gap: spacing.md,
    },
    block: {
      gap: spacing.sm,
    },
    heading: {
      ...typography.section,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    item: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      ...cardSurface(colors, isDark),
      minHeight: 72,
      gap: spacing.xs,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: {
      ...typography.micro,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
  });
}

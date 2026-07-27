import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import { MoneyText, moneyRowStyles } from './MoneyText';
import { ThemedPressable } from './ThemedPressable';

const ROW_ACTIVE_OPACITY = 0.75;

/** Shared compact list-row chrome for mobile density. */
export function useListItemStyles() {
  const { colors, isDark } = useTheme();
  return useMemo(() => createListItemStyles(colors, isDark), [colors, isDark]);
}

export function createListItemStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, isDark),
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginBottom: spacing.sm,
      minHeight: 56,
      justifyContent: 'center',
      // Never clip children — rows grow with wrapped amounts.
      overflow: 'visible',
    },
    top: {
      ...moneyRowStyles.row,
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    left: {
      ...moneyRowStyles.left,
      minWidth: 0,
      paddingRight: spacing.xs,
    },
    right: {
      maxWidth: '42%',
      minWidth: 88,
      flexGrow: 0,
      flexShrink: 1,
      alignItems: 'flex-end',
      gap: 4,
    },
    title: {
      ...typography.bodyMedium,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    meta: {
      ...typography.caption,
      fontSize: 11,
      lineHeight: 15,
      color: colors.textMuted,
      marginTop: 2,
    },
    pill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      marginTop: 4,
    },
    pillWarn: { backgroundColor: colors.warning + '22' },
    pillMuted: {
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pillText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.onPrimaryContainer,
      textTransform: 'uppercase',
      letterSpacing: 0.2,
    },
    pillTextWarn: { color: colors.warning },
    pillTextMuted: { color: colors.textMuted },
    dueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 4,
    },
    dueLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.danger,
    },
    chevron: { marginLeft: 2, alignSelf: 'center' },
  });
}

interface ListCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  showChevron?: boolean;
}

/** Full-row pressable card — tap anywhere to navigate. */
export const ListCard = memo(function ListCard({
  children,
  onPress,
  style,
  accessibilityLabel,
  showChevron = false,
}: ListCardProps) {
  const styles = useListItemStyles();
  const { colors } = useTheme();

  const body = showChevron ? (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </View>
  ) : (
    children
  );

  if (onPress) {
    return (
      <ThemedPressable
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={ROW_ACTIVE_OPACITY}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {body}
      </ThemedPressable>
    );
  }

  return <View style={[styles.card, style]}>{body}</View>;
});

interface ListItemProps {
  title: string;
  subtitle?: string;
  meta?: string;
  amount?: number;
  amountColor?: string;
  amountSize?: 'sm' | 'md' | 'lg';
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  dueAmount?: number;
  dueLabel?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  showChevron?: boolean;
  /** Compact pill under title (e.g. BOS / Customer). */
  pill?: string;
  pillTone?: 'default' | 'warn' | 'muted';
  /** Allow subtitle to wrap (default 2) — use for money-bearing secondary lines. */
  subtitleLines?: 1 | 2;
  metaLines?: 1 | 2;
}

/**
 * Compact entity row. Titles may ellipsis; amounts always shrink/wrap — never clip.
 */
export const ListItem = memo(function ListItem({
  title,
  subtitle,
  meta,
  amount,
  amountColor,
  amountSize = 'md',
  badge,
  trailing,
  dueAmount,
  dueLabel = 'Due',
  onPress,
  style,
  accessibilityLabel,
  showChevron = false,
  pill,
  pillTone = 'default',
  subtitleLines: _subtitleLines = 2,
  metaLines = 2,
}: ListItemProps) {
  const styles = useListItemStyles();
  const { colors } = useTheme();

  const content = (
    <View style={styles.top}>
      <View style={styles.left}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[styles.title, { flexShrink: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          {pill ? (
            <View
              style={[
                styles.pill,
                { marginTop: 0, alignSelf: 'center' },
                pillTone === 'warn' && styles.pillWarn,
                pillTone === 'muted' && styles.pillMuted,
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  pillTone === 'warn' && styles.pillTextWarn,
                  pillTone === 'muted' && styles.pillTextMuted,
                ]}
              >
                {pill}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={styles.meta} numberOfLines={metaLines}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {amount != null ? (
          <MoneyText
            amount={amount}
            size={amountSize}
            color={amountColor}
            style={{ width: '100%' }}
            lines={1}
          />
        ) : null}
        {badge}
        {dueAmount != null && dueAmount > 0.01 ? (
          <View style={[styles.dueRow, { justifyContent: 'flex-end', marginTop: 0 }]}>
            <Text style={styles.dueLabel}>{dueLabel}</Text>
            <MoneyText
              amount={dueAmount}
              size="sm"
              color={colors.danger}
              lines={1}
              style={{ textAlign: 'right' }}
            />
          </View>
        ) : null}
        {trailing}
      </View>
    </View>
  );

  return (
    <ListCard
      onPress={onPress}
      style={style}
      accessibilityLabel={accessibilityLabel ?? title}
      showChevron={showChevron}
    >
      {content}
    </ListCard>
  );
});

interface NavListRowProps {
  title: string;
  description?: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  isLast?: boolean;
}

/** Compact hub navigation row (reports, settings sections). */
export const NavListRow = memo(function NavListRow({
  title,
  description,
  onPress,
  icon,
  isLast,
}: NavListRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 48,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderLight,
          gap: spacing.sm,
          overflow: 'visible',
        },
        iconWrap: {
          width: 32,
          height: 32,
          borderRadius: radius.full,
          backgroundColor: colors.primaryContainer,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        },
        body: { flex: 1, minWidth: 0 },
        title: { fontSize: 14, fontWeight: '600', color: colors.text },
        desc: { fontSize: 12, color: colors.textSecondary, marginTop: 1, lineHeight: 16 },
        chevron: { flexShrink: 0 },
      }),
    [colors, isLast]
  );

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={ROW_ACTIVE_OPACITY}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={16} color={colors.onPrimaryContainer} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.desc} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
});


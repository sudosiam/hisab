import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import {
  formatDisplayDate,
  formatISODate,
  isValidISODate,
  parseISODate,
  todayISO,
} from '../utils/date';

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const WEEK_OPTS = { weekStartsOn: 1 as const };

interface Props {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  /** Inline layout for payment rows and tight forms. */
  compact?: boolean;
  accessibilityLabel?: string;
}

export function DatePickerField({
  label,
  value,
  onChange,
  compact = false,
  accessibilityLabel,
}: Props) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const initial = isValidISODate(value) ? parseISODate(value) : new Date();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initial));
  const [draft, setDraft] = useState(initial);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), WEEK_OPTS);
    const end = endOfWeek(endOfMonth(viewMonth), WEEK_OPTS);
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const openPicker = () => {
    const base = isValidISODate(value) ? parseISODate(value) : new Date();
    setDraft(base);
    setViewMonth(startOfMonth(base));
    setOpen(true);
  };

  const confirm = (date: Date) => {
    onChange(formatISODate(date));
    setOpen(false);
  };

  const display = formatDisplayDate(value);

  return (
    <>
      <View style={[styles.field, compact && styles.fieldCompact]}>
        {!compact ? <Text style={styles.label}>{label}</Text> : null}
        <TouchableOpacity
          style={[styles.trigger, compact && styles.triggerCompact]}
          onPress={openPicker}
          activeOpacity={0.75}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityRole="button"
        >
          {compact ? <Text style={styles.compactLabel}>{label}</Text> : null}
          <Text style={[styles.value, !isValidISODate(value) && styles.placeholder]}>
            {display}
          </Text>
          <Ionicons name="calendar-outline" size={compact ? 18 : 20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setViewMonth((m) => addMonths(m, -1))}
                accessibilityLabel="Previous month"
              >
                <Ionicons name="chevron-back" size={18} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>{format(viewMonth, 'MMMM yyyy')}</Text>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setViewMonth((m) => addMonths(m, 1))}
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAY_LABELS.map((day) => (
                <Text key={day} style={styles.weekday}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {monthDays.map((day) => {
                const inMonth = isSameMonth(day, viewMonth);
                const selected = isSameDay(day, draft);
                const today = isToday(day);
                return (
                  <TouchableOpacity
                    key={day.toISOString()}
                    style={[
                      styles.dayCell,
                      selected && styles.dayCellSelected,
                      today && !selected && styles.dayCellToday,
                    ]}
                    onPress={() => {
                      setDraft(day);
                      confirm(day);
                    }}
                    disabled={!inMonth}
                    accessibilityLabel={format(day, 'd MMMM yyyy')}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !inMonth && styles.dayTextMuted,
                        selected && styles.dayTextSelected,
                        today && !selected && styles.dayTextToday,
                      ]}
                    >
                      {format(day, 'd')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.footerBtn}
                onPress={() => {
                  const today = new Date();
                  setDraft(today);
                  setViewMonth(startOfMonth(today));
                  confirm(today);
                }}
              >
                <Text style={styles.footerBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerBtn} onPress={() => setOpen(false)}>
                <Text style={styles.footerBtnTextMuted}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    field: {
      marginBottom: spacing.md,
    },
    fieldCompact: {
      marginBottom: 0,
      flex: 1,
    },
    label: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      backgroundColor: colors.inputBg,
      gap: spacing.sm,
    },
    triggerCompact: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    compactLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginRight: spacing.xs,
    },
    value: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    placeholder: {
      color: colors.textMuted,
      fontWeight: '400',
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      ...cardSurface(colors, isDark),
      padding: spacing.md,
      borderRadius: radius.lg,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: colors.navActive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: spacing.xs,
    },
    weekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    dayCellSelected: {
      backgroundColor: colors.primary,
    },
    dayCellToday: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
    dayText: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
    },
    dayTextMuted: {
      color: colors.textMuted,
      opacity: 0.45,
    },
    dayTextSelected: {
      color: colors.onPrimary,
      fontWeight: '700',
    },
    dayTextToday: {
      color: colors.primary,
      fontWeight: '700',
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    footerBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    footerBtnText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 15,
    },
    footerBtnTextMuted: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 15,
    },
  });
}

/** Safe default when restoring drafts or empty values. */
export function resolveISODate(value: string | undefined, fallback = todayISO()): string {
  return value && isValidISODate(value) ? value : fallback;
}

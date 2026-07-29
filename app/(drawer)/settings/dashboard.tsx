import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  PrimaryButton,
  SectionHeader,
  ThemedPressable,
  useScreenStyles,
  ACTIVE_OPACITY,
} from '../../../src/components/ui';
import { ThemedSwitch } from '../../../src/components/ThemedSwitch';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing, typography } from '../../../src/constants/theme';
import {
  DASHBOARD_SECTION_LABELS,
  DEFAULT_DASHBOARD_PREFERENCES,
  getDashboardPreferences,
  moveSectionInOrder,
  RECENT_ACTIVITY_LIMIT_OPTIONS,
  resetDashboardPreferences,
  setDashboardAccountingBasis,
  setDashboardAmountsHidden,
  setDashboardHiddenSections,
  setDashboardRecentActivityLimit,
  setDashboardSectionOrder,
  setDashboardShowBasisToggle,
  setDashboardShowPeriodPicker,
  type DashboardPreferences,
  type DashboardSectionId,
  type RecentActivityLimit,
} from '../../../src/services/dashboardPreferences';
import type { AccountingBasis } from '../../../src/services/dashboard';

export default function DashboardSettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors, isDark } = useTheme();
  const [prefs, setPrefs] = useState<DashboardPreferences>(DEFAULT_DASHBOARD_PREFERENCES);
  const [busy, setBusy] = useState(false);

  const ui = useMemo(
    () =>
      StyleSheet.create({
        orderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 52,
        },
        orderLabel: {
          ...typography.bodyMedium,
          color: colors.text,
          flex: 1,
          minWidth: 0,
          fontWeight: '600',
        },
        orderMeta: {
          ...typography.micro,
          color: colors.textMuted,
          marginTop: 2,
        },
        iconBtn: {
          width: 40,
          height: 40,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainer,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        chipRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
        },
        chip: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceContainer,
          minHeight: 40,
          justifyContent: 'center',
        },
        chipActive: {
          backgroundColor: colors.primaryContainer,
          borderColor: colors.primaryContainer,
        },
        chipText: {
          ...typography.caption,
          color: colors.textSecondary,
          fontWeight: '600',
        },
        chipTextActive: {
          color: colors.onPrimaryContainer,
        },
        hint: {
          ...typography.caption,
          color: colors.textMuted,
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.sm,
          lineHeight: 18,
        },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    setPrefs(await getDashboardPreferences());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const persist = useCallback(async (next: DashboardPreferences) => {
    setPrefs(next);
  }, []);

  const move = async (id: DashboardSectionId, direction: -1 | 1) => {
    const sectionOrder = moveSectionInOrder(prefs.sectionOrder, id, direction);
    if (sectionOrder === prefs.sectionOrder) return;
    await setDashboardSectionOrder(sectionOrder);
    await persist({ ...prefs, sectionOrder });
  };

  const toggleHidden = async (id: DashboardSectionId) => {
    const hidden = new Set(prefs.hiddenSections);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    // Keep at least one section visible.
    if (hidden.size >= prefs.sectionOrder.length) {
      Alert.alert('Keep one section', 'At least one dashboard section must stay visible.');
      return;
    }
    const hiddenSections = [...hidden];
    await setDashboardHiddenSections(hiddenSections);
    await persist({ ...prefs, hiddenSections });
  };

  const setBasis = async (accountingBasis: AccountingBasis) => {
    await setDashboardAccountingBasis(accountingBasis);
    await persist({ ...prefs, accountingBasis });
  };

  const setAmounts = async (amountsHidden: boolean) => {
    await setDashboardAmountsHidden(amountsHidden);
    await persist({ ...prefs, amountsHidden });
  };

  const setShowPeriod = async (showPeriodPicker: boolean) => {
    await setDashboardShowPeriodPicker(showPeriodPicker);
    await persist({ ...prefs, showPeriodPicker });
  };

  const setShowBasis = async (showBasisToggle: boolean) => {
    await setDashboardShowBasisToggle(showBasisToggle);
    await persist({ ...prefs, showBasisToggle });
  };

  const setRecentLimit = async (recentActivityLimit: RecentActivityLimit) => {
    await setDashboardRecentActivityLimit(recentActivityLimit);
    await persist({ ...prefs, recentActivityLimit });
  };

  const onReset = () => {
    Alert.alert('Reset dashboard layout?', 'Restores default order, visibility, and options.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await resetDashboardPreferences();
              await load();
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionHeader title="Section order" />
      <View style={localStyles.sectionCard}>
        <Text style={ui.hint}>
          Use arrows to reorder. Toggle visibility for each block. Changes apply when you return to
          Home.
        </Text>
        {prefs.sectionOrder.map((id, index) => {
          const hidden = prefs.hiddenSections.includes(id);
          return (
            <React.Fragment key={id}>
              {index > 0 ? <SettingsDivider color={colors.borderLight} /> : null}
              <View style={ui.orderRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[ui.orderLabel, hidden && { opacity: 0.45 }]} numberOfLines={1}>
                    {DASHBOARD_SECTION_LABELS[id]}
                  </Text>
                  <Text style={ui.orderMeta}>{hidden ? 'Hidden' : `Position ${index + 1}`}</Text>
                </View>
                <ThemedPressable
                  style={ui.iconBtn}
                  onPress={() => void toggleHidden(id)}
                  accessibilityRole="button"
                  accessibilityLabel={hidden ? `Show ${DASHBOARD_SECTION_LABELS[id]}` : `Hide ${DASHBOARD_SECTION_LABELS[id]}`}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Ionicons
                    name={hidden ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </ThemedPressable>
                <ThemedPressable
                  style={[ui.iconBtn, index === 0 && { opacity: 0.35 }]}
                  onPress={() => void move(id, -1)}
                  disabled={index === 0}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${DASHBOARD_SECTION_LABELS[id]} up`}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Ionicons name="chevron-up" size={18} color={colors.text} />
                </ThemedPressable>
                <ThemedPressable
                  style={[
                    ui.iconBtn,
                    index === prefs.sectionOrder.length - 1 && { opacity: 0.35 },
                  ]}
                  onPress={() => void move(id, 1)}
                  disabled={index === prefs.sectionOrder.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${DASHBOARD_SECTION_LABELS[id]} down`}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Ionicons name="chevron-down" size={18} color={colors.text} />
                </ThemedPressable>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <SectionHeader title="Home header" />
      <View style={localStyles.sectionCard}>
        <View style={localStyles.settingsRow}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>Period picker</Text>
            <Text style={localStyles.rowMeta}>Month / FY / All at the top of Home</Text>
          </View>
          <ThemedSwitch value={prefs.showPeriodPicker} onValueChange={(v) => void setShowPeriod(v)} />
        </View>
        <SettingsDivider color={colors.borderLight} />
        <View style={localStyles.settingsRow}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>Accrual / Cash toggle</Text>
            <Text style={localStyles.rowMeta}>Show mode switch in the Home header</Text>
          </View>
          <ThemedSwitch value={prefs.showBasisToggle} onValueChange={(v) => void setShowBasis(v)} />
        </View>
      </View>

      <SectionHeader title="Defaults" />
      <View style={localStyles.sectionCard}>
        <Text style={ui.hint}>Default accounting basis when Home opens</Text>
        <View style={ui.chipRow}>
          {(
            [
              { key: 'accrual', label: 'Accrual' },
              { key: 'cash', label: 'Cash' },
            ] as const
          ).map((opt) => {
            const active = prefs.accountingBasis === opt.key;
            return (
              <ThemedPressable
                key={opt.key}
                style={[ui.chip, active && ui.chipActive]}
                onPress={() => void setBasis(opt.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={[ui.chipText, active && ui.chipTextActive]}>{opt.label}</Text>
              </ThemedPressable>
            );
          })}
        </View>
        <SettingsDivider color={colors.borderLight} />
        <View style={localStyles.settingsRow}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>Start with amounts hidden</Text>
            <Text style={localStyles.rowMeta}>Privacy blur on KPI amounts by default</Text>
          </View>
          <ThemedSwitch value={prefs.amountsHidden} onValueChange={(v) => void setAmounts(v)} />
        </View>
        <SettingsDivider color={colors.borderLight} />
        <Text style={ui.hint}>Recent activity rows per group</Text>
        <View style={ui.chipRow}>
          {RECENT_ACTIVITY_LIMIT_OPTIONS.map((n) => {
            const active = prefs.recentActivityLimit === n;
            return (
              <ThemedPressable
                key={n}
                style={[ui.chip, active && ui.chipActive]}
                onPress={() => void setRecentLimit(n)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={[ui.chipText, active && ui.chipTextActive]}>{n}</Text>
              </ThemedPressable>
            );
          })}
        </View>
      </View>

      <View style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
        <PrimaryButton title="Reset to defaults" onPress={onReset} loading={busy} variant="danger" />
      </View>
    </ScrollView>
  );
}

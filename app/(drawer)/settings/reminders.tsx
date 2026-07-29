import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FormInput, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { ThemedSwitch } from '../../../src/components/ThemedSwitch';
import { SettingsDivider, useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { useTheme } from '../../../src/context/ThemeContext';
import {
  getOverdueReminderDays,
  getOverdueSummary,
  isOverdueRemindersEnabled,
  setOverdueReminderDays,
  setOverdueRemindersEnabled,
  type OverdueSummary,
} from '../../../src/services/overdueReminders';
import { isNotificationsNativeUnavailable } from '../../../src/services/localNotifications';
import { formatCurrency } from '../../../src/utils/format';

export default function RemindersSettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState('7');
  const [summary, setSummary] = useState<OverdueSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const expoGo = isNotificationsNativeUnavailable();

  const load = useCallback(async () => {
    setEnabled(await isOverdueRemindersEnabled());
    setDays(String(await getOverdueReminderDays()));
    setSummary(await getOverdueSummary());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggle = async (value: boolean) => {
    if (busy) return;
    if (value && expoGo) {
      Alert.alert(
        'Native build required',
        'Overdue reminders need a Hisab APK / development build. Expo Go on Android no longer supports expo-notifications push (SDK 53+).'
      );
      return;
    }
    setBusy(true);
    setEnabled(value);
    try {
      const result = await setOverdueRemindersEnabled(value);
      if (!result.success) {
        setEnabled(false);
        Alert.alert('Reminders', result.message);
      }
      await load();
    } catch (e) {
      setEnabled(!value);
      Alert.alert('Reminders', e instanceof Error ? e.message : 'Could not update reminders');
    } finally {
      setBusy(false);
    }
  };

  const saveDays = async () => {
    const n = Number.parseInt(days, 10);
    if (!Number.isFinite(n) || n < 1) {
      Alert.alert('Invalid days', 'Enter a number between 1 and 90.');
      return;
    }
    await setOverdueReminderDays(n);
    await load();
    Alert.alert('Saved', `Overdue after ${n} days.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionHeader title="Local reminders" />
      <View style={localStyles.sectionCard}>
        {expoGo ? (
          <>
            <View style={localStyles.rowStack}>
              <Text style={localStyles.rowLabel}>Expo Go limitation</Text>
              <Text style={localStyles.rowMeta}>
                Reminders work in a native Hisab APK. Expo Go cannot schedule them on Android SDK
                53+.
              </Text>
            </View>
            <SettingsDivider color={colors.borderLight} />
          </>
        ) : null}
        <View style={localStyles.settingsRow}>
          <View style={localStyles.rowStack}>
            <Text style={localStyles.rowLabel}>Daily overdue nudge</Text>
            <Text style={localStyles.rowMeta}>
              Local notification at 9:00 summarizing receivables and payables older than the
              threshold. Daily auto backup also notifies when it finishes (native APK).
              No push server — stays on this device.
            </Text>
          </View>
          <ThemedSwitch value={enabled} onValueChange={toggle} disabled={busy || expoGo} />
        </View>
        <SettingsDivider color={colors.borderLight} />
        <View style={{ padding: 16, gap: 8 }}>
          <FormInput
            label="Due after (days)"
            value={days}
            onChangeText={setDays}
            onBlur={() => void saveDays()}
            keyboardType="number-pad"
          />
        </View>
        {summary ? (
          <>
            <SettingsDivider color={colors.borderLight} />
            <View style={localStyles.rowStack}>
              <Text style={localStyles.rowLabel}>Currently overdue</Text>
              <Text style={localStyles.rowMeta}>
                Receivables: {summary.receivableCount} · {formatCurrency(summary.receivableTotal)}
              </Text>
              <Text style={localStyles.rowMeta}>
                Payables: {summary.payableCount} · {formatCurrency(summary.payableTotal)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

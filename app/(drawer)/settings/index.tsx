import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenTitle, ThemeOption, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import type { ThemeMode } from '../../../src/constants/theme';
import { APP_VERSION } from '../../../src/constants/appVersion';
import { SettingsNavCard, useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { checkDownloadAndReload } from '../../../src/services/appUpdates';

const SETTINGS_ITEMS = [
  {
    title: 'Business Profile',
    route: '/(drawer)/settings/business',
    desc: 'Name, address, GST, UPI, WhatsApp',
    icon: 'storefront-outline' as const,
  },
  {
    title: 'Financial Year',
    route: '/(drawer)/settings/financial-year',
    desc: 'Current year and start month',
    icon: 'calendar-outline' as const,
  },
  {
    title: 'Invoicing',
    route: '/(drawer)/settings/invoicing',
    desc: 'Next sale, BOS, and purchase numbers',
    icon: 'document-text-outline' as const,
  },
  {
    title: 'Backup',
    route: '/(drawer)/settings/backup',
    desc: 'Local folder and cloud backup',
    icon: 'cloud-upload-outline' as const,
  },
  {
    title: 'Tally XML',
    route: '/(drawer)/settings/tally',
    desc: 'Import and export vouchers for Tally',
    icon: 'swap-horizontal-outline' as const,
  },
  {
    title: 'Data',
    route: '/(drawer)/settings/data',
    desc: 'Reset database',
    icon: 'trash-outline' as const,
  },
];

export default function SettingsIndexScreen() {
  const router = useRouter();
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors, themeMode, setThemeMode } = useTheme();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const setMode = (mode: ThemeMode) => setThemeMode(mode);

  const onCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const message = await checkDownloadAndReload();
      Alert.alert('App update', message);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenTitle title="Settings" subtitle="Appearance, business, backup, and data." />

      <View style={localStyles.sectionCard}>
        <Text style={[localStyles.rowLabel, { marginBottom: 8 }]}>Appearance</Text>
        <View style={localStyles.themeRow}>
          <ThemeOption label="Light" selected={themeMode === 'light'} onPress={() => setMode('light')} />
          <ThemeOption label="Dark" selected={themeMode === 'dark'} onPress={() => setMode('dark')} />
          <ThemeOption label="System" selected={themeMode === 'system'} onPress={() => setMode('system')} />
        </View>
      </View>

      {SETTINGS_ITEMS.map((item) => (
        <SettingsNavCard
          key={item.route}
          title={item.title}
          desc={item.desc}
          icon={<Ionicons name={item.icon} size={18} color={colors.onPrimaryContainer} />}
          chevronColor={colors.textMuted}
          onPress={() => router.push(item.route as never)}
        />
      ))}

      <View style={localStyles.sectionCard}>
        <View style={localStyles.aboutRow}>
          <Text style={localStyles.aboutLabel}>Version</Text>
          <Text style={localStyles.aboutValue}>{APP_VERSION}</Text>
        </View>
        <TouchableOpacity
          style={[localStyles.outlineBtn, { marginTop: 8, opacity: checkingUpdate ? 0.6 : 1 }]}
          onPress={() => void onCheckUpdate()}
          disabled={checkingUpdate}
          accessibilityRole="button"
          accessibilityLabel="Check for updates"
        >
          <Text style={localStyles.outlineBtnText}>
            {checkingUpdate ? 'Checking…' : 'Check for updates'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

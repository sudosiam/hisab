import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenTitle, SectionHeader, ThemeOption, useScreenStyles } from '../../../src/components/ui';
import { ThemedSwitch } from '../../../src/components/ThemedSwitch';
import { NavListRow } from '../../../src/components/ListItem';
import { useTheme } from '../../../src/context/ThemeContext';
import type { ThemeMode } from '../../../src/constants/theme';
import { spacing } from '../../../src/constants/theme';
import { APP_VERSION } from '../../../src/constants/appVersion';
import { useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { checkDownloadAndReload } from '../../../src/services/appUpdates';
import { isHapticsEnabled, setHapticsEnabled } from '../../../src/services/appSettings';
import { setHapticsEnabledCache } from '../../../src/utils/haptics';
import { cardSurface } from '../../../src/constants/shadows';

type SettingsItem = {
  title: string;
  route: string;
  icon: React.ComponentProps<typeof import('@expo/vector-icons').Ionicons>['name'];
};

const BUSINESS_ITEMS: SettingsItem[] = [
  {
    title: 'Business Profile',
    route: '/(drawer)/settings/business',
    icon: 'storefront-outline',
  },
  {
    title: 'Financial Year',
    route: '/(drawer)/settings/financial-year',
    icon: 'calendar-outline',
  },
  {
    title: 'Invoicing',
    route: '/(drawer)/settings/invoicing',
    icon: 'document-text-outline',
  },
];

const DATA_ITEMS: SettingsItem[] = [
  {
    title: 'Backup',
    route: '/(drawer)/settings/backup',
    icon: 'cloud-upload-outline',
  },
  {
    title: 'Tally XML',
    route: '/(drawer)/settings/tally',
    icon: 'swap-horizontal-outline',
  },
  {
    title: 'Data',
    route: '/(drawer)/settings/data',
    icon: 'trash-outline',
  },
];

function SettingsSection({
  items,
  onPress,
}: {
  items: SettingsItem[];
  onPress: (route: string) => void;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        ...cardSurface(colors, isDark),
        paddingHorizontal: 0,
        paddingVertical: 0,
        overflow: 'hidden',
        marginBottom: spacing.sm,
      }}
    >
      {items.map((item, index) => (
        <NavListRow
          key={item.route}
          title={item.title}
          icon={item.icon}
          onPress={() => onPress(item.route)}
          isLast={index === items.length - 1}
        />
      ))}
    </View>
  );
}

export default function SettingsIndexScreen() {
  const router = useRouter();
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { themeMode, setThemeMode } = useTheme();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);

  useEffect(() => {
    void isHapticsEnabled().then((enabled) => {
      setHapticsOn(enabled);
      setHapticsEnabledCache(enabled);
    });
  }, []);

  const setMode = (mode: ThemeMode) => setThemeMode(mode);

  const toggleHaptics = (enabled: boolean) => {
    setHapticsOn(enabled);
    setHapticsEnabledCache(enabled);
    void setHapticsEnabled(enabled).catch(() => {
      setHapticsOn(!enabled);
      setHapticsEnabledCache(!enabled);
    });
  };

  const onCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const message = await checkDownloadAndReload();
      Alert.alert('App update', message);
    } catch (e) {
      Alert.alert(
        'App update',
        e instanceof Error ? e.message : 'Could not check for updates.'
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenTitle title="Settings" />

      <View style={localStyles.sectionCard}>
        <Text style={[localStyles.rowLabel, { marginBottom: 8 }]}>Appearance</Text>
        <View style={localStyles.themeRow}>
          <ThemeOption label="Light" selected={themeMode === 'light'} onPress={() => setMode('light')} />
          <ThemeOption label="Dark" selected={themeMode === 'dark'} onPress={() => setMode('dark')} />
          <ThemeOption label="System" selected={themeMode === 'system'} onPress={() => setMode('system')} />
        </View>
        <View
          style={{
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={[localStyles.rowLabel, { flex: 1 }]}>Haptic feedback</Text>
          <ThemedSwitch
            value={hapticsOn}
            onValueChange={toggleHaptics}
          />
        </View>
      </View>

      <SectionHeader title="Business" />
      <SettingsSection items={BUSINESS_ITEMS} onPress={(route) => router.push(route as never)} />

      <SectionHeader title="Backup & Data" />
      <SettingsSection items={DATA_ITEMS} onPress={(route) => router.push(route as never)} />

      <SectionHeader title="About" />
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

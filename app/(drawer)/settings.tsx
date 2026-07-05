import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  PrimaryButton,
  SectionHeader,
  ThemeOption,
  useScreenStyles,
} from '../../src/components/ui';
import { resetDatabase } from '../../src/db/database';
import { useDatabase } from '../../src/context/DatabaseContext';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeMode } from '../../src/constants/theme';
import {
  backupDatabase,
  getBackupFolderUri,
  getLastDailyBackupDate,
  isAutoBackupEnabled,
  pickBackupFolder,
  restoreDatabaseFromBackup,
  RETENTION_DAYS,
  setAutoBackupEnabled,
} from '../../src/services/backup';
import { spacing } from '../../src/constants/theme';

export default function SettingsScreen() {
  const { refresh } = useDatabase();
  const { colors, themeMode, setThemeMode } = useTheme();
  const styles = useScreenStyles();
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [autoBackup, setAutoBackup] = useState(true);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setFolderUri(await getBackupFolderUri());
    setAutoBackup(await isAutoBackupEnabled());
    setLastBackupDate(await getLastDailyBackupDate());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handlePickFolder = async () => {
    const uri = await pickBackupFolder();
    if (uri) {
      setFolderUri(uri);
      Alert.alert('Success', 'Backup folder selected');
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    const result = await backupDatabase();
    setMessage(result.message);
    setBackingUp(false);
    if (result.success) {
      setLastBackupDate(await getLastDailyBackupDate());
      Alert.alert('Backup Complete', result.message);
    } else Alert.alert('Backup Failed', result.message);
  };

  const handleRestore = async () => {
    Alert.alert(
      'Restore Backup',
      'This replaces all current data with the backup file. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            const result = await restoreDatabaseFromBackup();
            setRestoring(false);
            if (result.success) {
              refresh();
              Alert.alert('Restored', result.message);
            } else {
              Alert.alert('Restore Failed', result.message);
            }
          },
        },
      ]
    );
  };

  const toggleAuto = async (value: boolean) => {
    setAutoBackup(value);
    await setAutoBackupEnabled(value);
  };

  const setMode = (mode: ThemeMode) => setThemeMode(mode);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionHeader title="Appearance" />
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg }}>
        <ThemeOption label="Light" selected={themeMode === 'light'} onPress={() => setMode('light')} />
        <ThemeOption label="Dark" selected={themeMode === 'dark'} onPress={() => setMode('dark')} />
        <ThemeOption label="System" selected={themeMode === 'system'} onPress={() => setMode('system')} />
      </View>

      <SectionHeader title="Database Backup" />
      <Text style={[styles.cardSub, { marginBottom: spacing.md }]}>
        Choose a folder on your device. When auto backup is on, Hisab saves one backup per day to that
        folder and keeps the last {RETENTION_DAYS} days.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Backup Folder</Text>
        <Text style={styles.value} numberOfLines={2}>
          {folderUri ?? 'Not selected'}
        </Text>
        <TouchableOpacity style={{ marginTop: spacing.sm }} onPress={handlePickFolder}>
          <Text style={styles.link}>Choose Folder</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.row, { marginBottom: spacing.sm }]}>
        <Text style={styles.label}>Daily Auto Backup</Text>
        <Switch
          value={autoBackup}
          onValueChange={toggleAuto}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.surface}
        />
      </View>

      <Text style={[styles.cardSub, { marginBottom: spacing.md }]}>
        Last backup: {lastBackupDate ?? 'Never'}
        {' · '}
        Retention: {RETENTION_DAYS} days
      </Text>

      <PrimaryButton title="Backup Now" onPress={handleBackup} loading={backingUp} />
      <PrimaryButton title="Restore from Backup" onPress={handleRestore} loading={restoring} />

      <TouchableOpacity
        style={styles.dangerBtn}
        onPress={() => {
          Alert.alert(
            'Reset Database',
            'Delete all local data and start fresh? This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: async () => {
                  await resetDatabase();
                  refresh();
                  Alert.alert('Done', 'Database reset. Default accounts recreated.');
                },
              },
            ]
          );
        }}
      >
        <Text style={styles.dangerText}>Reset Database</Text>
      </TouchableOpacity>

      {message ? (
        <Text style={[styles.cardSub, { marginTop: spacing.sm }]}>{message}</Text>
      ) : null}

      <View style={styles.infoBox}>
        <Text style={[styles.cardTitle, { marginBottom: spacing.xs }]}>About Hisab</Text>
        <Text style={styles.cardSub}>
          Version 1.0.0 · Business management with local SQLite storage. Works with Expo Go SDK 54 on Android.
        </Text>
      </View>
    </ScrollView>
  );
}

import React, { useState } from 'react';
import { ScrollView, View, Text, Alert, TouchableOpacity, Modal, Pressable } from 'react-native';
import { FormInput, PrimaryButton, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { getDatabase, resetDatabase, formatSqliteError } from '../../../src/db/database';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { clearAllDrafts } from '../../../src/services/formDrafts';
import { useSettingsStyles } from '../../../src/components/settings/settingsUi';

const RESET_CONFIRM_TEXT = 'RESET';

export default function DataSettingsScreen() {
  const { refresh } = useDatabaseActions();
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resetting, setResetting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const canConfirmReset = resetConfirmInput.trim().toUpperCase() === RESET_CONFIRM_TEXT;

  const openResetModal = () => {
    setResetConfirmInput('');
    setResetModalOpen(true);
  };

  const closeResetModal = () => {
    if (resetting) return;
    setResetModalOpen(false);
    setResetConfirmInput('');
  };

  const handleOptimizeDatabase = async () => {
    if (optimizing) return;
    setOptimizing(true);
    try {
      const db = await getDatabase();
      await db.execAsync('ANALYZE;');
      await db.execAsync('VACUUM;');
      Alert.alert('Done', 'Database optimized (ANALYZE + VACUUM).');
    } catch (e) {
      Alert.alert('Optimize failed', formatSqliteError(e));
    } finally {
      setOptimizing(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!canConfirmReset || resetting) return;
    setResetting(true);
    try {
      await resetDatabase();
      await clearAllDrafts().catch(() => {});
      refresh();
      setResetModalOpen(false);
      setResetConfirmInput('');
      Alert.alert('Done', 'Database reset. Default accounts recreated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not reset database');
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <SectionHeader title="Maintenance" />
        <View style={localStyles.sectionCard}>
          <TouchableOpacity
            style={localStyles.outlineBtn}
            onPress={handleOptimizeDatabase}
            disabled={optimizing}
            activeOpacity={0.7}
          >
            <Text style={localStyles.outlineBtnText}>
              {optimizing ? 'Optimizing…' : 'Optimize database'}
            </Text>
          </TouchableOpacity>
          <Text style={[localStyles.rowMeta, { paddingHorizontal: 16, paddingBottom: 12 }]}>
            Runs ANALYZE + VACUUM. Safe; may take a moment on large books.
          </Text>
        </View>

        <SectionHeader title="Danger zone" />
        <View style={localStyles.sectionCard}>
          <TouchableOpacity style={localStyles.dangerBtn} onPress={openResetModal} activeOpacity={0.7}>
            <Text style={localStyles.dangerText}>Reset database</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={resetModalOpen} transparent animationType="fade" onRequestClose={closeResetModal}>
        <Pressable style={localStyles.modalBackdrop} onPress={closeResetModal}>
          <Pressable style={localStyles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={localStyles.modalTitle}>Reset database</Text>
            <Text style={localStyles.modalText}>
              Erases every sale, purchase, and account on this device and starts empty books. This is
              not Restore (which loads a backup) and not Start fresh on Backup (which also turns
              backups back on). Type {RESET_CONFIRM_TEXT} to confirm.
            </Text>
            <FormInput
              label="Confirmation"
              value={resetConfirmInput}
              onChangeText={setResetConfirmInput}
              placeholder={RESET_CONFIRM_TEXT}
              keyboardType="default"
            />
            <View style={localStyles.modalActions}>
              <TouchableOpacity
                style={localStyles.modalCancel}
                onPress={closeResetModal}
                disabled={resetting}
              >
                <Text style={localStyles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Reset"
                  onPress={handleResetDatabase}
                  loading={resetting}
                  disabled={!canConfirmReset}
                  variant="danger"
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

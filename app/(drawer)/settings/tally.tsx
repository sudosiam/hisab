import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { PrimaryButton, useScreenStyles } from '../../../src/components/ui';
import { useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { formatSqliteError } from '../../../src/db/database';
import {
  exportTallyXmlAndShare,
  formatTallyImportSummary,
  pickAndImportTallyXml,
  shareTallySampleXml,
} from '../../../src/services/tallyXml';

export default function TallySettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { refresh } = useDatabaseActions();
  const [busy, setBusy] = useState<'export' | 'import' | 'sample' | null>(null);

  const onExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const result = await exportTallyXmlAndShare();
      Alert.alert(
        'Exported',
        `${result.parties} parties · ${result.sales} sales · ${result.purchases} purchases · ${result.receipts} receipts · ${result.payments} payments`
      );
    } catch (e) {
      Alert.alert('Export failed', formatSqliteError(e));
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const result = await pickAndImportTallyXml();
      refresh();
      Alert.alert('Import complete', formatTallyImportSummary(result));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('cancel')) return;
      Alert.alert('Import failed', formatSqliteError(e));
    } finally {
      setBusy(null);
    }
  };

  const onSample = async () => {
    if (busy) return;
    setBusy('sample');
    try {
      await shareTallySampleXml();
    } catch (e) {
      Alert.alert('Sample failed', formatSqliteError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[localStyles.sectionCard, { gap: 10 }]}>
        <PrimaryButton
          title={busy === 'export' ? 'Exporting…' : 'Export to Tally XML'}
          onPress={onExport}
          loading={busy === 'export'}
          disabled={!!busy && busy !== 'export'}
        />
        <PrimaryButton
          title={busy === 'import' ? 'Importing…' : 'Import from Tally XML'}
          onPress={onImport}
          loading={busy === 'import'}
          disabled={!!busy && busy !== 'import'}
          variant="secondary"
        />
        <PrimaryButton
          title={busy === 'sample' ? 'Sharing…' : 'Share sample XML'}
          onPress={onSample}
          loading={busy === 'sample'}
          disabled={!!busy && busy !== 'sample'}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

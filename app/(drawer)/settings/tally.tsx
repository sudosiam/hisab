import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { PrimaryButton, useScreenStyles } from '../../../src/components/ui';
import { useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatSqliteError } from '../../../src/db/database';
import { spacing, typography } from '../../../src/constants/theme';
import {
  exportTallyXmlAndShare,
  formatTallyImportSummary,
  pickAndImportTallyXml,
  shareTallySampleXml,
} from '../../../src/services/tallyXml';
import { sharePurchaseImportSampleXml } from '../../../src/services/purchaseXmlImport';

export default function TallySettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { colors } = useTheme();
  const { refresh } = useDatabaseActions();
  const [busy, setBusy] = useState<'export' | 'import' | 'sample' | 'purchaseSample' | null>(null);

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

  const onPurchaseSample = async () => {
    if (busy) return;
    setBusy('purchaseSample');
    try {
      await sharePurchaseImportSampleXml();
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

      <View style={[localStyles.sectionCard, { gap: 10, marginTop: spacing.md }]}>
        <Text style={{ ...typography.caption, color: colors.textSecondary }}>
          Hisab purchase import (New Purchase → Import purchases XML). Not a Tally file.
        </Text>
        <PrimaryButton
          title={
            busy === 'purchaseSample' ? 'Sharing…' : 'Share purchase import sample (Hisab XML)'
          }
          onPress={onPurchaseSample}
          loading={busy === 'purchaseSample'}
          disabled={!!busy && busy !== 'purchaseSample'}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

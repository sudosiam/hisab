import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { PrimaryButton, ScreenTitle, useScreenStyles } from '../../../src/components/ui';
import { useSettingsStyles } from '../../../src/components/settings/settingsUi';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { formatSqliteError } from '../../../src/db/database';
import {
  exportTallyXmlAndShare,
  pickAndImportTallyXml,
  shareTallySampleXml,
} from '../../../src/services/tallyXml';

export default function TallySettingsScreen() {
  const styles = useScreenStyles();
  const localStyles = useSettingsStyles();
  const { refresh } = useDatabase();
  const [busy, setBusy] = useState<'export' | 'import' | 'sample' | null>(null);

  const onExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const result = await exportTallyXmlAndShare();
      Alert.alert(
        'Exported',
        `Shared Tally XML with ${result.parties} parties, ${result.sales} sales, and ${result.purchases} purchases (current financial year).`
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
      const errorTail =
        result.errors.length > 0
          ? `\n\nIssues:\n${result.errors.slice(0, 5).join('\n')}`
          : '';
      Alert.alert(
        'Import complete',
        `Parties touched: ${result.partiesCreated}\nSales: ${result.salesImported}\nPurchases: ${result.purchasesImported}\nSkipped: ${result.skipped}${errorTail}`
      );
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
      <ScreenTitle
        title="Tally XML"
        subtitle="Export or import sales, purchases, and party ledgers for Tally."
      />

      <View style={localStyles.sectionCard}>
        <Text style={localStyles.rowLabel}>Export</Text>
        <Text style={[localStyles.rowMeta, { marginBottom: 12 }]}>
          Creates a Tally-compatible XML for the current financial year: customers, vendors, sales
          (Tax Invoice + Bill of Supply), and purchases.
        </Text>
        <PrimaryButton
          title={busy === 'export' ? 'Exporting…' : 'Export to Tally XML'}
          onPress={onExport}
          loading={busy === 'export'}
          disabled={!!busy && busy !== 'export'}
        />
      </View>

      <View style={localStyles.sectionCard}>
        <Text style={localStyles.rowLabel}>Import</Text>
        <Text style={[localStyles.rowMeta, { marginBottom: 12 }]}>
          Pick a Tally XML file. Existing vouchers with the same number and date are skipped.
          Missing products and parties are created.
        </Text>
        <PrimaryButton
          title={busy === 'import' ? 'Importing…' : 'Import from Tally XML'}
          onPress={onImport}
          loading={busy === 'import'}
          disabled={!!busy && busy !== 'import'}
        />
      </View>

      <View style={localStyles.sectionCard}>
        <Text style={localStyles.rowLabel}>Sample file</Text>
        <Text style={[localStyles.rowMeta, { marginBottom: 12 }]}>
          Share a small sample XML (2 parties, 1 sale, 1 purchase) to compare with Tally&apos;s
          format.
        </Text>
        <PrimaryButton
          title={busy === 'sample' ? 'Sharing…' : 'Share sample XML'}
          onPress={onSample}
          loading={busy === 'sample'}
          disabled={!!busy && busy !== 'sample'}
        />
      </View>
    </ScrollView>
  );
}

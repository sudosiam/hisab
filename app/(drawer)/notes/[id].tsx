import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter, useNavigation } from 'expo-router';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import {
  deleteAdjustmentNote,
  getAdjustmentNoteById,
  getAdjustmentNoteItems,
} from '../../../src/services/adjustmentNotes';
import { getPurchaseById } from '../../../src/services/purchases';
import { getSaleById } from '../../../src/services/sales';
import { formatSqliteError } from '../../../src/db/database';
import { OverflowMenu } from '../../../src/components/OverflowMenu';
import { StatCard } from '../../../src/components/StatCard';
import {
  FormScreen,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useGstEnabled } from '../../../src/context/GstContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatDisplayDate } from '../../../src/utils/date';
import { stackDetailBeforeRemove } from '../../../src/navigation/screenOptions';
import { stateName } from '../../../src/services/gst';
import { spacing, radius } from '../../../src/constants/theme';
import type { AdjustmentNote, AdjustmentNoteItem } from '../../../src/types';

function kindLabel(kind: AdjustmentNote['note_kind']): string {
  return kind === 'credit' ? 'Credit Note' : 'Debit Note';
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { refresh } = useDatabase();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const gstEnabled = useGstEnabled();
  const noteId = useMemo(() => parseRouteId(id), [id]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      stackDetailBeforeRemove(navigation as never, e as never);
    });
    return unsub;
  }, [navigation]);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        invoice: { fontSize: 20, fontWeight: '700', color: colors.text },
        kindBadge: {
          alignSelf: 'flex-start',
          marginTop: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radius.sm,
          backgroundColor: colors.primary + '18',
        },
        kindBadgeCredit: { backgroundColor: colors.warning + '22' },
        kindBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
        kindBadgeTextCredit: { color: colors.warning },
        party: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
        date: { fontSize: 13, color: colors.textSecondary },
        kpiRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginVertical: spacing.md,
        },
        itemRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        itemName: { fontWeight: '500', color: colors.text },
        itemMeta: { fontSize: 12, color: colors.textSecondary },
        itemTotal: { fontWeight: '600', color: colors.text },
        muted: { color: colors.textSecondary, fontSize: 13 },
        linkRow: { marginTop: spacing.sm },
      }),
    [colors]
  );

  const [note, setNote] = useState<AdjustmentNote | null>(null);
  const [items, setItems] = useState<AdjustmentNoteItem[]>([]);
  const [againstInvoiceNo, setAgainstInvoiceNo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!noteId) {
      setError('Invalid note');
      setLoading(false);
      return;
    }
    try {
      const [n, i] = await Promise.all([
        getAdjustmentNoteById(noteId),
        getAdjustmentNoteItems(noteId),
      ]);
      setNote(n);
      setItems(i);
      if (n?.against_sale_id) {
        const sale = await getSaleById(n.against_sale_id);
        setAgainstInvoiceNo(sale?.invoice_no ?? null);
      } else if (n?.against_purchase_id) {
        const purchase = await getPurchaseById(n.against_purchase_id);
        setAgainstInvoiceNo(purchase?.invoice_no ?? null);
      } else {
        setAgainstInvoiceNo(null);
      }
      setError(n ? null : 'Note not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setNote(null);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleDelete = useCallback(() => {
    if (!note) return;
    Alert.alert('Delete Note', `Delete ${note.note_no}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAdjustmentNote(note.id);
            refresh();
            router.dismissTo('/(drawer)/notes' as never);
          } catch (e) {
            Alert.alert('Error', formatSqliteError(e));
          }
        },
      },
    ]);
  }, [note, refresh, router]);

  const handlePreviewPdf = useCallback(async () => {
    if (!note) return;
    try {
      const { previewAdjustmentNotePdf } = await import('../../../src/services/adjustmentNotePdf');
      await previewAdjustmentNotePdf(note.id);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [note]);

  const handleSharePdf = useCallback(async () => {
    if (!note) return;
    try {
      const { shareAdjustmentNotePdf } = await import('../../../src/services/adjustmentNotePdf');
      await shareAdjustmentNotePdf(note.id);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [note]);

  const handleDownloadPdf = useCallback(async () => {
    if (!note) return;
    try {
      const { downloadAdjustmentNotePdf } = await import('../../../src/services/adjustmentNotePdf');
      const result = await downloadAdjustmentNotePdf(note.id);
      if (!result.success) Alert.alert('Could not save', result.message);
      else if (result.message.startsWith('Saved')) Alert.alert('Saved', result.message);
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    }
  }, [note]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: note
        ? () => (
            <OverflowMenu
              actions={[
                { label: 'Preview / Print', onPress: handlePreviewPdf },
                { label: 'Download PDF', onPress: handleDownloadPdf },
                { label: 'Share PDF', onPress: handleSharePdf },
                { label: 'Delete Note', destructive: true, onPress: handleDelete },
              ]}
            />
          )
        : undefined,
    });
  }, [navigation, note, handleDelete, handlePreviewPdf, handleDownloadPdf, handleSharePdf]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !note) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>{error ?? 'Note not found'}</Text>
        <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => router.dismissTo('/(drawer)/notes' as never)}>
          <Text style={styles.link}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const outputTax =
    (note.cgst_amount ?? 0) + (note.sgst_amount ?? 0) + (note.igst_amount ?? 0);
  const placeLabel = note.place_of_supply
    ? stateName(note.place_of_supply) || note.place_of_supply
    : null;
  const isCredit = note.note_kind === 'credit';

  return (
    <FormScreen>
      <View style={localStyles.header}>
        <Text style={localStyles.invoice}>{note.note_no}</Text>
      </View>
      <View style={[localStyles.kindBadge, isCredit && localStyles.kindBadgeCredit]}>
        <Text style={[localStyles.kindBadgeText, isCredit && localStyles.kindBadgeTextCredit]}>
          {kindLabel(note.note_kind)} · {note.direction === 'sale' ? 'Sales' : 'Purchase'}
        </Text>
      </View>
      <Text style={localStyles.party}>{note.party_name}</Text>
      <Text style={localStyles.date}>{formatDisplayDate(note.date)}</Text>
      {againstInvoiceNo ? (
        <Text style={localStyles.date}>Against invoice: {againstInvoiceNo}</Text>
      ) : null}
      {note.reason ? <Text style={localStyles.date}>Reason: {note.reason}</Text> : null}
      {gstEnabled && placeLabel ? (
        <Text style={localStyles.date}>Place of supply: {placeLabel}</Text>
      ) : null}

      <View style={localStyles.kpiRow}>
        <StatCard label="Total" value={note.total_amount} color={colors.primary} />
        {gstEnabled ? (
          <>
            <StatCard
              label="Tax"
              value={outputTax}
              color={outputTax > 0 ? colors.primary : colors.textSecondary}
              subtitle={
                (note.igst_amount ?? 0) > 0.009
                  ? 'IGST'
                  : outputTax > 0
                    ? 'CGST + SGST'
                    : 'No tax'
              }
            />
            <StatCard label="Taxable" value={note.taxable_amount} color={colors.accent} />
          </>
        ) : null}
      </View>

      <SectionHeader title="Items" />
      {items.map((item) => {
        const lineTax =
          (item.cgst_amount ?? 0) + (item.sgst_amount ?? 0) + (item.igst_amount ?? 0);
        const name = item.product_name ?? item.description ?? 'Item';
        return (
          <View key={item.id} style={localStyles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.itemName}>{name}</Text>
              <Text style={localStyles.itemMeta}>
                {item.qty} × {formatCurrency(item.unit_price)}
                {gstEnabled && item.hsn_sac ? ` · HSN ${item.hsn_sac}` : ''}
                {gstEnabled
                  ? (item.gst_rate ?? 0) > 0.009
                    ? ` · GST ${item.gst_rate}% · Tax ${formatCurrency(lineTax)}`
                    : ' · No GST'
                  : ''}
              </Text>
            </View>
            <Text style={localStyles.itemTotal}>{formatCurrency(item.total)}</Text>
          </View>
        );
      })}

      {note.notes ? (
        <>
          <SectionHeader title="Notes" />
          <Text style={localStyles.muted}>{note.notes}</Text>
        </>
      ) : null}
    </FormScreen>
  );
}

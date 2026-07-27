import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
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
import { DetailHeaderActions } from '../../../src/components/DetailHeaderActions';
import { StatCard } from '../../../src/components/StatCard';
import { MoneyText } from '../../../src/components/MoneyText';
import { DetailSkeleton } from '../../../src/components/Skeleton';
import {
  EmptyState,
  ErrorState,
  FormScreen,
  SectionHeader,
  useScreenStyles,
} from '../../../src/components/ui';
import { formatCurrency } from '../../../src/utils/format';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatDisplayDate } from '../../../src/utils/date';
import { stackDetailBeforeRemove } from '../../../src/navigation/screenOptions';
import { spacing, radius } from '../../../src/constants/theme';
import type { AdjustmentNote, AdjustmentNoteItem } from '../../../src/types';

function kindLabel(kind: AdjustmentNote['note_kind']): string {
  return kind === 'credit' ? 'Credit Note' : 'Debit Note';
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { refresh } = useDatabaseActions();
  const { colors } = useTheme();
  const styles = useScreenStyles();
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
            <DetailHeaderActions
              onShare={handleSharePdf}
              overflowActions={[
                { label: 'Preview / Print', onPress: handlePreviewPdf },
                { label: 'Download PDF', onPress: handleDownloadPdf },
                { label: 'Delete Note', destructive: true, onPress: handleDelete },
              ]}
            />
          )
        : undefined,
    });
  }, [navigation, note, handleDelete, handlePreviewPdf, handleDownloadPdf, handleSharePdf]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => { void load(); }} />;
  }

  if (!note) {
    return (
      <EmptyState
        title="Not found"
        message="This record is missing or was deleted."
        actionLabel="Go Back"
        onAction={() => router.dismissTo('/(drawer)/notes' as never)}
      />
    );
  }

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
      

      <View style={styles.detailKpiRow}>
        <StatCard label="Total" value={note.total_amount} color={colors.primary} />
        
      </View>

      <SectionHeader title="Items" />
      {items.map((item) => {
        const name = item.product_name ?? item.description ?? 'Item';
        return (
          <View key={item.id} style={localStyles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.itemName}>{name}</Text>
              <Text style={localStyles.itemMeta}>
                {item.qty} × {formatCurrency(item.unit_price)}

                
              </Text>
            </View>
            <MoneyText amount={item.total} size="md" style={localStyles.itemTotal} />
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

import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteAttachment,
  downloadAttachment,
  getAttachmentFileUri,
  isImageMime,
  isPdfAttachment,
  openAttachmentExternal,
  shareAttachment,
} from '../services/attachments';
import { AttachmentPdfViewer } from './AttachmentPdfViewer';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import type { Attachment } from '../types';

interface Props {
  item: Attachment | null;
  onClose: () => void;
  onDeleted: () => void;
  onDelete?: (item: Attachment) => Promise<void>;
}

export function AttachmentViewerModal({ item, onClose, onDeleted, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<'open' | 'share' | 'download' | 'delete' | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.92)',
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.sm,
        },
        title: {
          flex: 1,
          color: '#FFFFFF',
          fontSize: 15,
          fontWeight: '600',
          marginRight: spacing.sm,
        },
        closeBtn: {
          width: 40,
          height: 40,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.12)',
        },
        body: {
          flex: 1,
          alignSelf: 'stretch',
          paddingHorizontal: spacing.xs,
        },
        image: {
          width: '100%',
          height: '100%',
        },
        docWrap: {
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
        },
        docName: {
          color: '#FFFFFF',
          fontSize: 16,
          fontWeight: '600',
          textAlign: 'center',
        },
        docHint: {
          color: 'rgba(255,255,255,0.65)',
          fontSize: 13,
          textAlign: 'center',
        },
        actionBar: {
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingTop: spacing.md,
          paddingHorizontal: spacing.md,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.12)',
          backgroundColor: 'rgba(0,0,0,0.35)',
        },
        actionBtn: {
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 72,
          gap: 6,
          paddingVertical: spacing.sm,
        },
        actionLabel: {
          color: '#FFFFFF',
          fontSize: 12,
          fontWeight: '600',
        },
        actionLabelDanger: {
          color: colors.danger,
          fontSize: 12,
          fontWeight: '600',
        },
        openPdfBtn: {
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 72,
          gap: 6,
          paddingVertical: spacing.sm,
        },
      }),
    [colors.danger]
  );

  if (!item) return null;

  const uri = getAttachmentFileUri(item.storage_path);
  const isImage = isImageMime(item.mime_type);
  const isPdf = isPdfAttachment(item.mime_type, item.file_name);

  const runAction = async (
    kind: 'open' | 'share' | 'download' | 'delete',
    fn: () => Promise<void | string>
  ) => {
    setBusy(kind);
    try {
      const message = await fn();
      if (kind === 'download' && typeof message === 'string') {
        Alert.alert('Download', message);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = () => {
    Alert.alert('Remove attachment', `Remove ${item.file_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          runAction('delete', async () => {
            if (onDelete) {
              await onDelete(item);
            } else {
              await deleteAttachment(item.id);
            }
            onDeleted();
            onClose();
          }),
      },
    ]);
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
          <Text style={styles.title} numberOfLines={1}>
            {item.file_name}
          </Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {isImage ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          ) : isPdf ? (
            <AttachmentPdfViewer item={item} uri={uri} />
          ) : (
            <View style={styles.docWrap}>
              <Ionicons name="document-text-outline" size={72} color="#FFFFFF" />
              <Text style={styles.docName}>{item.file_name}</Text>
            </View>
          )}
        </View>

        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          {isPdf ? (
            <TouchableOpacity
              style={styles.openPdfBtn}
              onPress={() => runAction('open', () => openAttachmentExternal(item))}
              disabled={busy !== null}
            >
              {busy === 'open' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="open-outline" size={26} color="#FFFFFF" />
              )}
              <Text style={styles.actionLabel}>Open</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => runAction('share', () => shareAttachment(item))}
            disabled={busy !== null}
          >
            {busy === 'share' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name="share-outline" size={26} color="#FFFFFF" />
            )}
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => runAction('download', () => downloadAttachment(item))}
            disabled={busy !== null}
          >
            {busy === 'download' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name="download-outline" size={26} color="#FFFFFF" />
            )}
            <Text style={styles.actionLabel}>Download</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleDelete} disabled={busy !== null}>
            {busy === 'delete' ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={26} color={colors.danger} />
            )}
            <Text style={styles.actionLabelDanger}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

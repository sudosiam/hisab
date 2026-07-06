import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SectionHeader } from './ui';
import {
  deleteAttachment,
  deletePendingAttachment,
  getAttachmentFileUri,
  getAttachments,
  isImageMime,
  isPdfAttachment,
  pendingAttachmentAsViewItem,
  pickAndAddAttachment,
  pickAndAddPendingAttachment,
} from '../services/attachments';
import { AttachmentViewerModal } from './AttachmentViewerModal';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../constants/theme';
import { cardSurface } from '../constants/shadows';
import type { Attachment, AttachmentReferenceType, PendingAttachment } from '../types';

interface SavedProps {
  referenceType: AttachmentReferenceType;
  referenceId: number;
  pendingSessionKey?: never;
  pendingAttachments?: never;
  onPendingAttachmentsChange?: never;
}

interface PendingProps {
  referenceType: AttachmentReferenceType;
  referenceId?: never;
  pendingSessionKey: string;
  pendingAttachments: PendingAttachment[];
  onPendingAttachmentsChange: (items: PendingAttachment[]) => void;
}

type Props = SavedProps | PendingProps;

function isPendingMode(props: Props): props is PendingProps {
  return props.pendingSessionKey !== undefined;
}

export function AttachmentSection(props: Props) {
  const { referenceType } = props;
  const pendingMode = isPendingMode(props);
  const { colors, isDark } = useTheme();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(!pendingMode);
  const [uploading, setUploading] = useState(false);
  const [viewerItem, setViewerItem] = useState<Attachment | null>(null);

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          ...cardSurface(colors, isDark),
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        grid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.sm,
        },
        thumbWrap: {
          width: 96,
          height: 96,
          borderRadius: radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.inputBg,
        },
        thumb: { width: '100%', height: '100%' },
        fileRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        fileName: { flex: 1, fontSize: 14, color: colors.text },
        uploadBtn: {
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 2,
          borderColor: colors.primary + '55',
          borderStyle: 'dashed',
          backgroundColor: colors.navActive,
          minHeight: 132,
        },
        uploadBtnCompact: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderStyle: 'dashed',
          backgroundColor: colors.inputBg,
          marginTop: spacing.sm,
        },
        uploadText: { color: colors.primary, fontWeight: '700', fontSize: 18 },
        uploadTextCompact: { color: colors.primary, fontWeight: '600', fontSize: 14 },
      }),
    [colors, isDark]
  );

  const load = useCallback(async () => {
    if (pendingMode) return;
    setLoading(true);
    try {
      setAttachments(await getAttachments(referenceType, props.referenceId));
    } finally {
      setLoading(false);
    }
  }, [pendingMode, props, referenceType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const displayAttachments = pendingMode
    ? props.pendingAttachments.map((item) => pendingAttachmentAsViewItem(item, referenceType))
    : attachments;

  const handleUpload = () => {
    Alert.alert('Add attachment', undefined, [
      { text: 'Camera', onPress: () => uploadFrom('camera') },
      { text: 'Gallery', onPress: () => uploadFrom('gallery') },
      { text: 'File', onPress: () => uploadFrom('document') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadFrom = async (source: 'camera' | 'gallery' | 'document') => {
    setUploading(true);
    try {
      if (pendingMode) {
        const added = await pickAndAddPendingAttachment(props.pendingSessionKey, source);
        if (added) {
          props.onPendingAttachmentsChange([...props.pendingAttachments, added]);
        }
      } else {
        const added = await pickAndAddAttachment(referenceType, props.referenceId, source);
        if (added) await load();
      }
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not add attachment');
    } finally {
      setUploading(false);
    }
  };

  const openAttachment = (item: Attachment) => {
    setViewerItem(item);
  };

  const confirmDelete = (item: Attachment) => {
    Alert.alert('Remove attachment', `Remove ${item.file_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (pendingMode) {
            const pending = props.pendingAttachments.find(
              (p) => p.storage_path === item.storage_path
            );
            if (pending) {
              await deletePendingAttachment(pending);
              props.onPendingAttachmentsChange(
                props.pendingAttachments.filter((p) => p.localKey !== pending.localKey)
              );
            }
          } else {
            await deleteAttachment(item.id);
            await load();
          }
        },
      },
    ]);
  };

  const handleViewerDelete = async (item: Attachment) => {
    if (pendingMode) {
      const pending = props.pendingAttachments.find((p) => p.storage_path === item.storage_path);
      if (!pending) return;
      await deletePendingAttachment(pending);
      props.onPendingAttachmentsChange(
        props.pendingAttachments.filter((p) => p.localKey !== pending.localKey)
      );
      return;
    }
    await deleteAttachment(item.id);
    await load();
  };

  const images = displayAttachments.filter((a) => isImageMime(a.mime_type));
  const pdfs = displayAttachments.filter((a) => isPdfAttachment(a.mime_type, a.file_name));
  const files = displayAttachments.filter(
    (a) => !isImageMime(a.mime_type) && !isPdfAttachment(a.mime_type, a.file_name)
  );

  return (
    <View style={{ marginTop: spacing.md }}>
      <SectionHeader title="Attachments" />
      <View style={localStyles.card}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : displayAttachments.length > 0 ? (
          <>
            {images.length > 0 ? (
              <View style={localStyles.grid}>
                {images.map((item) => (
                  <TouchableOpacity
                    key={pendingMode ? item.storage_path : item.id}
                    style={localStyles.thumbWrap}
                    onPress={() => openAttachment(item)}
                    onLongPress={() => confirmDelete(item)}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: getAttachmentFileUri(item.storage_path) }}
                      style={localStyles.thumb}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {pdfs.map((item) => (
              <TouchableOpacity
                key={pendingMode ? item.storage_path : item.id}
                style={localStyles.fileRow}
                onPress={() => openAttachment(item)}
                onLongPress={() => confirmDelete(item)}
              >
                <Ionicons name="document-text-outline" size={24} color={colors.danger} />
                <Text style={localStyles.fileName} numberOfLines={2}>
                  {item.file_name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            {files.map((item) => (
              <TouchableOpacity
                key={pendingMode ? item.storage_path : item.id}
                style={localStyles.fileRow}
                onPress={() => openAttachment(item)}
                onLongPress={() => confirmDelete(item)}
              >
                <Ionicons name="document-outline" size={22} color={colors.primary} />
                <Text style={localStyles.fileName} numberOfLines={2}>
                  {item.file_name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        <TouchableOpacity
          style={
            displayAttachments.length === 0 ? localStyles.uploadBtn : localStyles.uploadBtnCompact
          }
          onPress={handleUpload}
          disabled={uploading}
          activeOpacity={0.75}
        >
          {uploading ? (
            <ActivityIndicator
              color={colors.primary}
              size={displayAttachments.length === 0 ? 'large' : 'small'}
            />
          ) : displayAttachments.length === 0 ? (
            <>
              <Ionicons name="images-outline" size={44} color={colors.primary} />
              <Text style={localStyles.uploadText}>Add Photos</Text>
            </>
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={localStyles.uploadTextCompact}>Add</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <AttachmentViewerModal
        item={viewerItem}
        onClose={() => setViewerItem(null)}
        onDeleted={() => {
          if (!pendingMode) load();
        }}
        onDelete={pendingMode ? handleViewerDelete : undefined}
      />
    </View>
  );
}

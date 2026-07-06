import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { openAttachmentExternal } from '../services/attachments';
import type { Attachment } from '../types';

interface Props {
  item: Attachment;
  uri: string;
}

const LOAD_TIMEOUT_MS = 12_000;

export function AttachmentPdfViewer({ item, uri }: Props) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [webUri, setWebUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);

  const markFailed = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setFailed(true);
  };

  useEffect(() => {
    let active = true;
    setFailed(false);
    setWebUri(null);

    timeoutRef.current = setTimeout(() => {
      if (active) markFailed();
    }, LOAD_TIMEOUT_MS);

    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) throw new Error('File not found');

        const resolved =
          Platform.OS === 'android' ? await FileSystem.getContentUriAsync(uri) : uri;
        if (active) setWebUri(resolved);
      } catch {
        if (active) markFailed();
      }
    })();

    return () => {
      active = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [item, uri]);

  const handleOpenExternal = async () => {
    setOpening(true);
    try {
      await openAttachmentExternal(item);
    } finally {
      setOpening(false);
    }
  };

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.failText}>Could not preview this PDF in the app.</Text>
        <TouchableOpacity style={styles.openBtn} onPress={handleOpenExternal} disabled={opening}>
          {opening ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.openBtnText}>Open PDF</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (!webUri) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        source={{ uri: webUri }}
        style={styles.viewer}
        originWhitelist={['*']}
        javaScriptEnabled={false}
        setSupportMultipleWindows={false}
        onLoadEnd={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }}
        onError={() => markFailed()}
        onHttpError={() => markFailed()}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        )}
      />
      {Platform.OS === 'android' ? (
        <TouchableOpacity style={styles.floatingOpen} onPress={handleOpenExternal} disabled={opening}>
          <Text style={styles.floatingOpenText}>{opening ? 'Opening…' : 'Open in PDF app'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%' },
  viewer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#2d2d2d',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2d2d2d',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
    backgroundColor: '#2d2d2d',
  },
  failText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    textAlign: 'center',
  },
  openBtn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  openBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  floatingOpen: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  floatingOpenText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { openAttachmentExternal, readAttachmentBase64 } from '../services/attachments';
import type { Attachment } from '../types';

interface Props {
  item: Attachment;
  uri: string;
}

const PDF_VIEWER_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>
      html, body { margin: 0; padding: 0; background: #2d2d2d; }
      body { padding: 10px 8px 24px; }
      #status {
        color: #d1d5db;
        text-align: center;
        padding: 24px 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
      }
      canvas {
        display: block;
        width: 100% !important;
        height: auto !important;
        margin: 0 auto 14px;
        background: #ffffff;
        border-radius: 4px;
      }
    </style>
  </head>
  <body>
    <div id="status">Loading PDF…</div>
    <div id="pages"></div>
    <script>
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      window.renderPdfFromApp = function (base64) {
        var status = document.getElementById('status');
        var container = document.getElementById('pages');
        container.innerHTML = '';

        try {
          var raw = atob(base64);
          var bytes = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

          pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
            status.textContent = '';
            var scale = Math.max(1, Math.min(2.2, (window.innerWidth - 16) / 595));

            function renderPage(pageNum) {
              if (pageNum > pdf.numPages) return Promise.resolve();
              return pdf.getPage(pageNum).then(function (page) {
                var viewport = page.getViewport({ scale: scale });
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                container.appendChild(canvas);
                return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                  return renderPage(pageNum + 1);
                });
              });
            }

            return renderPage(1);
          }).catch(function (err) {
            status.textContent = 'Could not render PDF.';
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(err) }));
          });
        } catch (err) {
          status.textContent = 'Could not render PDF.';
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(err) }));
        }
      };
    </script>
  </body>
</html>`;

export function AttachmentPdfViewer({ item, uri }: Props) {
  const webRef = useRef<WebView>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    setFailed(false);
    setBase64(null);

    readAttachmentBase64(item)
      .then((data) => {
        if (active) setBase64(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [item, uri]);

  const injectPdf = () => {
    if (!base64 || !webRef.current) return;
    webRef.current.injectJavaScript(
      `window.renderPdfFromApp(${JSON.stringify(base64)}); true;`
    );
  };

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

  if (!base64) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        source={{ html: PDF_VIEWER_HTML }}
        style={styles.viewer}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        onLoadEnd={() => {
          setReady(true);
          injectPdf();
        }}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data);
            if (payload.type === 'error') setFailed(true);
          } catch {
            setFailed(true);
          }
        }}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        )}
      />
      {!ready ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : null}
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45,45,45,0.85)',
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

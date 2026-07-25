import * as Sharing from 'expo-sharing';
import { Linking, Platform, Share } from 'react-native';
import { normalizeWhatsAppPhone } from './whatsappPhone';

export { normalizeWhatsAppPhone };

export type WhatsAppPdfShareOptions = {
  /** Local file URI (file:// or bare path under cache). */
  fileUri: string;
  /** Party phone; Indian 10-digit numbers get +91. */
  phone?: string | null;
  /** Prefill chat / share text. */
  message: string;
  /** Dialog / share title. */
  title?: string;
};

function toFileUrl(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
}

/**
 * Open WhatsApp with PDF attached and message filled, targeting the party number when possible.
 * Android (dev/production build): opens the customer's chat with PDF + text.
 * iOS / Expo Go fallback: system share / WhatsApp text link (OS limits file+number deep links).
 */
export async function sharePdfToWhatsApp(options: WhatsAppPdfShareOptions): Promise<void> {
  const message = options.message.trim();
  const title = options.title?.trim() || 'Share PDF';
  const fileUrl = toFileUrl(options.fileUri);
  const waPhone = normalizeWhatsAppPhone(options.phone);

  if (await shareViaReactNativeShare(fileUrl, waPhone, message, title)) {
    return;
  }

  if (Platform.OS === 'android' && (await shareViaIntentLauncher(fileUrl, waPhone, message))) {
    return;
  }

  if (Platform.OS === 'ios') {
    try {
      const result = await Share.share({
        message,
        url: fileUrl,
        title,
      });
      if (result.action !== Share.dismissedAction) return;
    } catch {
      // Fall through.
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUrl, {
      mimeType: 'application/pdf',
      dialogTitle: message.slice(0, 100) || title,
      UTI: 'com.adobe.pdf',
    });
    return;
  }

  if (waPhone) {
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return;
    }
  }

  throw new Error('Could not share PDF to WhatsApp');
}

async function shareViaReactNativeShare(
  fileUrl: string,
  waPhone: string | null,
  message: string,
  title: string
): Promise<boolean> {
  try {
    const mod = await import('react-native-share');
    const ShareRN = mod.default;
    const social = mod.Social?.Whatsapp;
    if (!social) return false;

    await ShareRN.shareSingle({
      title,
      message,
      url: fileUrl,
      type: 'application/pdf',
      filename: 'document.pdf',
      social,
      ...(waPhone ? { whatsAppNumber: waPhone } : {}),
    });
    return true;
  } catch (error) {
    // User cancel or native module missing (Expo Go / old binary).
    const msg = error instanceof Error ? error.message : String(error);
    if (/user did not share|User did not share|cancelled|canceled/i.test(msg)) {
      return true;
    }
    return false;
  }
}

async function shareViaIntentLauncher(
  fileUrl: string,
  waPhone: string | null,
  message: string
): Promise<boolean> {
  let IntentLauncher: typeof import('expo-intent-launcher') | null = null;
  let FileSystem: typeof import('expo-file-system/legacy') | null = null;
  try {
    IntentLauncher = await import('expo-intent-launcher');
    FileSystem = await import('expo-file-system/legacy');
  } catch {
    return false;
  }

  let contentUri: string;
  try {
    contentUri = await FileSystem.getContentUriAsync(fileUrl);
  } catch {
    return false;
  }

  const packages = ['com.whatsapp', 'com.whatsapp.w4b'] as const;
  const FLAG_GRANT_READ_URI_PERMISSION = 1;

  for (const packageName of packages) {
    const extra: Record<string, string> = {
      'android.intent.extra.STREAM': contentUri,
    };
    if (message) extra['android.intent.extra.TEXT'] = message;
    if (waPhone) extra.jid = `${waPhone}@s.whatsapp.net`;

    try {
      await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
        type: 'application/pdf',
        packageName,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
        extra,
      });
      return true;
    } catch {
      // Try next package / fallback.
    }
  }
  return false;
}

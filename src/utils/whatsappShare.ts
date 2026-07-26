import * as Sharing from 'expo-sharing';
import { Linking, NativeModules, Platform, Share, TurboModuleRegistry } from 'react-native';
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
 * Soft-check for the native RNShare module.
 * Never call TurboModuleRegistry.getEnforcing — that redboxes when missing.
 */
function isReactNativeShareAvailable(): boolean {
  try {
    const registry = TurboModuleRegistry as {
      get?: (name: string) => unknown;
    };
    if (typeof registry.get === 'function' && registry.get('RNShare')) {
      return true;
    }
  } catch {
    // ignore
  }
  return !!NativeModules.RNShare;
}

async function ensurePdfExists(fileUrl: string): Promise<void> {
  const FileSystem = await import('expo-file-system/legacy');
  const info = await FileSystem.getInfoAsync(fileUrl);
  if (!info.exists || (typeof info.size === 'number' && info.size < 32)) {
    throw new Error('PDF file is missing or empty — try again.');
  }
}

/**
 * Open WhatsApp with PDF + message attached (auto-opens WhatsApp when native
 * react-native-share is linked in the APK).
 *
 * Important: do NOT use expo-intent-launcher for EXTRA_STREAM — it puts the URI
 * as a String, and WhatsApp then shows "Couldn't share. Please try again."
 */
export async function sharePdfToWhatsApp(options: WhatsAppPdfShareOptions): Promise<void> {
  const message = options.message.trim();
  const title = options.title?.trim() || 'Share PDF';
  const fileUrl = toFileUrl(options.fileUri);
  const waPhone = normalizeWhatsAppPhone(options.phone);

  await ensurePdfExists(fileUrl);

  // 1) Native react-native-share → auto-opens WhatsApp with PDF + caption + phone.
  // Pass file:// so RNShare uses its own FileProvider (content:// from Expo often fails).
  if (isReactNativeShareAvailable()) {
    const rnShare = await shareViaReactNativeShare(fileUrl, waPhone, message, title);
    if (rnShare === 'ok' || rnShare === 'cancelled') return;
  }

  // 2) System share sheet (FileProvider + ClipData). User picks WhatsApp.
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUrl, {
      mimeType: 'application/pdf',
      dialogTitle: waPhone
        ? `${title} — pick WhatsApp, then choose the customer`
        : title,
      UTI: 'com.adobe.pdf',
    });
    return;
  }

  // 3) iOS RN Share API
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

  // 4) Text-only WhatsApp chat (no PDF) as last resort.
  if (waPhone) {
    await openWhatsAppChat(waPhone, message);
    return;
  }

  throw new Error(
    'Could not share PDF. Install the latest Hisab APK, or use Download PDF and share from Files.'
  );
}

async function openWhatsAppChat(waPhone: string, message: string): Promise<void> {
  const text = encodeURIComponent(message);
  const appUrl = `whatsapp://send?phone=${waPhone}&text=${text}`;
  const webUrl = `https://wa.me/${waPhone}?text=${text}`;
  try {
    if (await Linking.canOpenURL(appUrl)) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {
    // Fall through to wa.me
  }
  if (await Linking.canOpenURL(webUrl)) {
    await Linking.openURL(webUrl);
    return;
  }
  throw new Error('WhatsApp is not installed on this device.');
}

function isUserCancel(msg: string): boolean {
  return /user did not share|User did not share|cancelled|canceled/i.test(msg);
}

async function shareViaReactNativeShare(
  fileUrl: string,
  waPhone: string | null,
  message: string,
  title: string
): Promise<'ok' | 'cancelled' | 'fail'> {
  try {
    const mod = await import('react-native-share');
    const ShareRN = mod.default;
    if (!ShareRN?.shareSingle && !ShareRN?.open) return 'fail';

    // Must use Social.WHATSAPP from the default export (not Social.Whatsapp).
    // whatsAppNumber is supported natively but missing from the published TS types.
    type WaShareOpts = {
      title: string;
      message: string;
      url: string;
      type: string;
      filename: string;
      social: string;
      whatsAppNumber?: string;
    };
    const caption = message.slice(0, 300);
    const targets = [ShareRN.Social?.WHATSAPP, ShareRN.Social?.WHATSAPPBUSINESS].filter(
      (s): s is string => typeof s === 'string' && s.length > 0
    );

    if (ShareRN.shareSingle && targets.length > 0) {
      const shareSingle = ShareRN.shareSingle as (opts: WaShareOpts) => Promise<unknown>;
      for (const social of targets) {
        // Prefer: PDF + caption + customer chat.
        if (waPhone) {
          try {
            await shareSingle({
              title,
              message: caption,
              url: fileUrl,
              type: 'application/pdf',
              filename: 'invoice.pdf',
              social,
              whatsAppNumber: waPhone,
            });
            return 'ok';
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (isUserCancel(msg)) return 'cancelled';
          }
        }

        // Fallback: open WhatsApp with PDF + caption (contact picker).
        try {
          await shareSingle({
            title,
            message: caption,
            url: fileUrl,
            type: 'application/pdf',
            filename: 'invoice.pdf',
            social,
          });
          return 'ok';
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (isUserCancel(msg)) return 'cancelled';
        }
      }
    }

    if (ShareRN.open) {
      await ShareRN.open({
        title,
        message: caption,
        url: fileUrl,
        type: 'application/pdf',
        filename: 'invoice.pdf',
        failOnCancel: false,
        showAppsToView: true,
      });
      return 'ok';
    }
    return 'fail';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isUserCancel(msg)) return 'cancelled';
    return 'fail';
  }
}

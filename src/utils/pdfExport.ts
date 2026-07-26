import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { deferDeleteCacheFile } from './tempShareFiles';

export type PdfExportResult = { success: boolean; message: string };

/** Copy a cache PDF into a user-chosen folder (Android SAF) or open the system share/save sheet. */
export async function savePdfToDevice(
  cacheUri: string,
  fileName: string
): Promise<PdfExportResult> {
  const src = cacheUri.startsWith('file://') ? cacheUri : `file://${cacheUri}`;
  try {
    const info = await FileSystem.getInfoAsync(src);
    if (!info.exists || (typeof info.size === 'number' && info.size < 32)) {
      return { success: false, message: 'PDF file is missing or empty.' };
    }

    if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted && permissions.directoryUri) {
        const base64 = await FileSystem.readAsStringAsync(src, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const dest = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          fileName,
          'application/pdf'
        );
        await FileSystem.writeAsStringAsync(dest, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return { success: true, message: `Saved ${fileName}.` };
      }
      // User denied folder picker — fall through to share sheet.
    }

    if (!(await Sharing.isAvailableAsync())) {
      return { success: false, message: 'Saving is not available on this device.' };
    }
    await Sharing.shareAsync(src, {
      mimeType: 'application/pdf',
      dialogTitle: `Save ${fileName}`,
      UTI: 'com.adobe.pdf',
    });
    deferDeleteCacheFile(src);
    return { success: true, message: 'Use the share sheet to save the PDF.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Could not save PDF.',
    };
  }
}

/** Offer Share vs Save for any prepared PDF in cache. */
export function promptShareOrSavePdf(options: {
  cacheUri: string;
  fileName: string;
  share: () => Promise<void>;
  title?: string;
}): void {
  Alert.alert(options.title ?? 'PDF', 'Share or save this PDF?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Save',
      onPress: () => {
        void savePdfToDevice(options.cacheUri, options.fileName).then((result) => {
          if (!result.success) Alert.alert('Could not save', result.message);
          else if (result.message.startsWith('Saved')) Alert.alert('Saved', result.message);
        });
      },
    },
    {
      text: 'Share',
      onPress: () => {
        void options.share().catch((error) => {
          Alert.alert(
            'Could not share',
            error instanceof Error ? error.message : 'Share failed.'
          );
        });
      },
    },
  ]);
}

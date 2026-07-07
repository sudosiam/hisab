import { Alert } from 'react-native';
import { isInvoiceNumberDuplicate } from '../services/invoiceNumbers';

/** Warn when an invoice number is reused, but still run save if the user confirms. */
export async function saveWithDuplicateInvoiceWarning(
  table: 'sales' | 'purchases',
  invoiceNo: string,
  save: () => Promise<void>,
  excludeId?: number
): Promise<void> {
  const trimmed = invoiceNo.trim();
  if (!trimmed) {
    await save();
    return;
  }

  const duplicate = await isInvoiceNumberDuplicate(table, trimmed, excludeId);
  if (!duplicate) {
    await save();
    return;
  }

  const label = table === 'sales' ? 'sale' : 'purchase';
  return new Promise((resolve) => {
    Alert.alert(
      'Duplicate invoice number',
      `"${trimmed}" is already used on another ${label}. You can still save.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
        {
          text: 'Save anyway',
          onPress: async () => {
            try {
              await save();
            } finally {
              resolve();
            }
          },
        },
      ]
    );
  });
}

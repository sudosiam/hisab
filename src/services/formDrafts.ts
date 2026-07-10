import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = '@hisab_draft_';

export const DRAFT_KEYS = {
  saleNew: 'sale_new',
  purchaseNew: 'purchase_new',
  expenseNew: 'expense_new',
} as const;

export type DraftKey = (typeof DRAFT_KEYS)[keyof typeof DRAFT_KEYS];

export interface DraftPaymentRow {
  account_id: number;
  amount: string;
  date: string;
  notes: string;
}

export interface SaleFormDraft {
  partyName: string;
  partyPhone: string;
  invoiceNo: string;
  invoiceType: 'invoice' | 'bos';
  date: string;
  notes: string;
  discount: string;
  serviceCharges: string;
  items: { key: string; product_id: number; qty: string; unit_price: string }[];
  payments: DraftPaymentRow[];
}

export interface PurchaseFormDraft {
  supplierName: string;
  invoiceNo: string;
  date: string;
  vendorInvoiceNo: string;
  notes: string;
  discount: string;
  items: { key: string; product_id: number; qty: string; unit_cost: string }[];
  payments: DraftPaymentRow[];
}

export interface ExpenseFormDraft {
  category: string;
  description: string;
  amount: string;
  date: string;
  accountId: number;
  isRecurring: boolean;
  recurrence: string;
}

export async function loadDraft<T>(key: DraftKey): Promise<T | null> {
  const raw = await AsyncStorage.getItem(DRAFT_PREFIX + key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveDraft<T>(key: DraftKey, data: T): Promise<void> {
  await AsyncStorage.setItem(
    DRAFT_PREFIX + key,
    JSON.stringify({ ...data, savedAt: new Date().toISOString() })
  );
}

export async function clearDraft(key: DraftKey): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_PREFIX + key);
}

/** Remove every saved form draft (used when the database is reset or restored). */
export async function clearAllDrafts(): Promise<void> {
  await Promise.all(
    Object.values(DRAFT_KEYS).map((key) => AsyncStorage.removeItem(DRAFT_PREFIX + key))
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = '@hisab_draft_';

export const DRAFT_KEYS = {
  saleNew: 'sale_new',
  purchaseNew: 'purchase_new',
  expenseNew: 'expense_new',
  paymentNew: 'payment_new',
  noteNew: 'note_new',
  otherIncomeNew: 'other_income_new',
  inventoryNew: 'inventory_new',
  addAccount: 'add_account',
} as const;

export type DraftKey = (typeof DRAFT_KEYS)[keyof typeof DRAFT_KEYS];

export interface DraftPaymentRow {
  account_id: number;
  amount: string;
  date: string;
  notes: string;
}

export interface PaymentFormDraft {
  voucherType: 'receipt' | 'payment';
  voucherNo: string;
  date: string;
  partyName: string;
  accountId: number;
  amount: string;
  applyMode: 'against_invoice' | 'advance' | 'on_account';
  selectedInvoiceNo: string | null;
  narration: string;
  instrumentNo: string;
  paymentMode: string;
}

export interface NoteFormDraft {
  noteKind: 'credit' | 'debit';
  direction: 'sale' | 'purchase';
  partyName: string;
  date: string;
  reason: string;
  notes: string;
  items: {
    key: string;
    product_id: number;
    description: string;
    qty: string;
    unit_price: string;
    hsn_sac: string;
  }[];
}

export interface OtherIncomeFormDraft {
  category: string;
  description: string;
  amount: string;
  date: string;
  accountId: number;
}

export interface InventoryFormDraft {
  name: string;
  category: string;
  sku: string;
  unit: string;
  openingQty: string;
  openingCost: string;
  sellPrice: string;
}

export interface AddAccountFormDraft {
  name: string;
  type: 'cash' | 'bank';
  opening: string;
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
  items: {
    key: string;
    product_id: number;
    qty: string;
    unit_price: string;
    gst_rate?: string;
    hsn_sac?: string;
  }[];
  payments: DraftPaymentRow[];
  /** Prefer applying party advance when credit exists. Older drafts omit this. */
  applyAdvance?: boolean;
}

export interface PurchaseFormDraft {
  supplierName: string;
  invoiceNo: string;
  date: string;
  vendorInvoiceNo: string;
  notes: string;
  discount: string;
  items: {
    key: string;
    product_id: number;
    qty: string;
    unit_cost: string;
    gst_rate?: string;
    hsn_sac?: string;
  }[];
  payments: DraftPaymentRow[];
  applyAdvance?: boolean;
}

export interface ExpenseFormDraft {
  category: string;
  description: string;
  amount: string;
  date: string;
  accountId: number;
  fundingMode?: 'account' | 'borrowed';
  loanId?: number;
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

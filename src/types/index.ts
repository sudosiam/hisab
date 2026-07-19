export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type SaleInvoiceType = 'invoice' | 'bos';
export type AccountType = 'cash' | 'bank';
export type MovementType = 'opening' | 'purchase' | 'sale' | 'adjustment';
export type TransactionType =
  | 'sale_payment'
  | 'purchase_payment'
  | 'expense'
  | 'other_income'
  | 'transfer'
  | 'deposit'
  | 'withdrawal'
  | 'opening'
  | 'adjustment';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  opening_balance: number;
  current_balance: number;
  is_excluded: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  opening_qty: number;
  opening_cost: number;
  avg_cost: number;
  sell_price: number;
  current_qty: number;
  is_hidden?: number;
  hsn_sac?: string | null;
  gst_rate?: number;
  created_at: string;
}

export interface InventoryMovement {
  id: number;
  product_id: number;
  type: MovementType;
  qty: number;
  unit_cost: number;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  created_at: string;
  product_name?: string;
}

export interface Sale {
  id: number;
  invoice_no: string;
  invoice_type: SaleInvoiceType;
  party_id: number | null;
  party_name: string;
  date: string;
  subtotal: number;
  discount_amount: number;
  service_charges: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  is_inter_state: number;
  place_of_supply: string | null;
  total_amount: number;
  paid_amount: number;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  qty: number;
  unit_price: number;
  unit_cost: number;
  total: number;
  hsn_sac?: string | null;
  gst_rate?: number;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  product_name?: string;
}

export interface SalePayment {
  id: number;
  sale_id: number;
  account_id: number;
  amount: number;
  date: string;
  notes: string | null;
  account_name?: string;
}

export interface Purchase {
  id: number;
  invoice_no: string;
  party_id: number | null;
  supplier_name: string;
  vendor_invoice_no: string | null;
  date: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  is_inter_state: number;
  place_of_supply: string | null;
  total_amount: number;
  paid_amount: number;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
}

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  product_id: number;
  qty: number;
  unit_cost: number;
  total: number;
  hsn_sac?: string | null;
  gst_rate?: number;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  product_name?: string;
}

export interface PurchasePayment {
  id: number;
  purchase_id: number;
  account_id: number;
  amount: number;
  date: string;
  notes: string | null;
  account_name?: string;
}

export interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  account_id: number;
  date: string;
  is_recurring: number;
  recurrence: string | null;
  created_at: string;
  account_name?: string;
}

export interface OtherIncome {
  id: number;
  category: string;
  description: string;
  amount: number;
  account_id: number;
  date: string;
  created_at: string;
  account_name?: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  type: TransactionType;
  amount: number;
  reference_type: string | null;
  reference_id: number | null;
  payment_id: number | null;
  description: string;
  date: string;
  created_at: string;
  account_name?: string;
}

export interface DashboardStats {
  sold: number;
  purchased: number;
  grossProfit: number;
  otherIncome: number;
  netProfit: number;
  expense: number;
  totalLiquid: number;
  receivable: number;
  payable: number;
  inventoryValue: number;
  netWorth: number;
}

export interface BalanceSheetLine {
  key: string;
  label: string;
  amount: number;
}

export interface BalanceSheet {
  assets: {
    cashAndBank: number;
    inventory: number;
    receivables: number;
    inputTaxCredit: number;
    fixedAssets: number;
    total: number;
    currentAssets: BalanceSheetLine[];
    nonCurrentAssets: BalanceSheetLine[];
  };
  liabilities: {
    payables: number;
    outputTax: number;
    loans: number;
    total: number;
    currentLiabilities: BalanceSheetLine[];
    nonCurrentLiabilities: BalanceSheetLine[];
  };
  equity: number;
}

export interface FixedAsset {
  id: number;
  name: string;
  value: number;
  notes: string | null;
  created_at: string;
}

export interface Loan {
  id: number;
  lender_name: string;
  principal_amount: number;
  outstanding_amount: number;
  interest_rate: number | null;
  start_date: string | null;
  notes: string | null;
  created_at: string;
}

export type PartyType = 'customer' | 'vendor';

export interface Party {
  id: number;
  name: string;
  type: PartyType;
  phone: string | null;
  notes: string | null;
  gstin?: string | null;
  state?: string | null;
  address?: string | null;
  created_at: string;
}

export interface PartyWithSummary extends Party {
  invoice_count: number;
  balance_due: number;
  last_activity: string | null;
}

export interface PartySummary {
  party: Party;
  invoiceCount: number;
  totalBilled: number;
  totalPaid: number;
  balanceDue: number;
  lastActivityDate: string | null;
}

export interface PartyStatementLine {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference_type: 'sale' | 'purchase' | 'payment';
  reference_id: number;
}

export interface PartyStatementResult {
  openingBalance: number;
  closingBalance: number;
  lines: PartyStatementLine[];
}

export interface PartyHistoryItem {
  id: number;
  invoice_no: string;
  invoice_type?: string | null;
  date: string;
  total_amount: number;
  paid_amount: number;
  status: PaymentStatus;
  record_type: 'sale' | 'purchase';
}

export interface PaymentInput {
  account_id: number;
  amount: number;
  date: string;
  notes?: string;
}

export interface SaleItemInput {
  product_id: number;
  qty: number;
  unit_price: number;
  hsn_sac?: string | null;
  gst_rate?: number | null;
}

export interface PurchaseItemInput {
  product_id: number;
  qty: number;
  unit_cost: number;
  hsn_sac?: string | null;
  gst_rate?: number | null;
}

export interface BusinessProfile {
  business_name: string;
  business_address: string;
  business_gstin: string;
  business_state: string;
  gst_enabled: boolean;
  whatsapp_message_template: string;
}


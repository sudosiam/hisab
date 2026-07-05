export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type AccountType = 'cash' | 'bank';
export type MovementType = 'opening' | 'purchase' | 'sale' | 'adjustment';
export type TransactionType =
  | 'sale_payment'
  | 'purchase_payment'
  | 'expense'
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
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  opening_qty: number;
  opening_cost: number;
  avg_cost: number;
  sell_price: number;
  current_qty: number;
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
  party_name: string;
  date: string;
  subtotal: number;
  discount_amount: number;
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
  supplier_name: string;
  date: string;
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

export interface Transaction {
  id: number;
  account_id: number;
  type: TransactionType;
  amount: number;
  reference_type: string | null;
  reference_id: number | null;
  description: string;
  date: string;
  created_at: string;
  account_name?: string;
}

export interface DashboardStats {
  sold: number;
  purchased: number;
  grossProfit: number;
  netProfit: number;
  expense: number;
  totalLiquid: number;
  receivable: number;
  inventoryValue: number;
}

export interface BalanceSheet {
  assets: {
    cashAndBank: number;
    inventory: number;
    receivables: number;
    fixedAssets: number;
    total: number;
  };
  liabilities: {
    payables: number;
    total: number;
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

export type PartyType = 'customer' | 'vendor';

export interface Party {
  id: number;
  name: string;
  type: PartyType;
  phone: string | null;
  notes: string | null;
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

export interface PartyHistoryItem {
  id: number;
  invoice_no: string;
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
}

export interface PurchaseItemInput {
  product_id: number;
  qty: number;
  unit_cost: number;
}

import { getDatabase } from '../db/database';
import { resolvePeriodRange } from '../utils/period';

export interface ActivityItem {
  id: string;
  type: 'sale' | 'purchase' | 'expense';
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  refId: number;
}

export interface GroupedRecentActivity {
  sales: ActivityItem[];
  purchases: ActivityItem[];
  expenses: ActivityItem[];
}

type ActivityRow = {
  act_type: string;
  id: number;
  ref: string;
  party: string;
  amount: number;
  date: string;
  created_at: string;
  invoice_type?: string | null;
};

function mapRow(r: ActivityRow): ActivityItem {
  const typeLabel =
    r.act_type === 'sale'
      ? r.invoice_type === 'bos'
        ? 'BOS'
        : 'Sale'
      : r.act_type === 'purchase'
        ? 'Purchase'
        : 'Expense';
  return {
    id: `${r.act_type}-${r.id}`,
    type: r.act_type as ActivityItem['type'],
    title: r.ref,
    subtitle: `${typeLabel} · ${r.party}`,
    amount: r.amount,
    date: r.date,
    refId: r.id,
  };
}

async function queryRecentByType(
  limit: number,
  periodKey?: string
): Promise<{ sales: ActivityRow[]; purchases: ActivityRow[]; expenses: ActivityRow[] }> {
  const db = await getDatabase();
  const range = periodKey ? await resolvePeriodRange(periodKey) : null;
  const saleParams: (string | number)[] = range ? [range.start, range.end, limit] : [limit];
  const purchaseParams: (string | number)[] = range ? [range.start, range.end, limit] : [limit];
  const expenseParams: (string | number)[] = range ? [range.start, range.end, limit] : [limit];

  const salePeriod = range ? 'AND s.date >= ? AND s.date <= ?' : '';
  const purchasePeriod = range ? 'AND p.date >= ? AND p.date <= ?' : '';
  const expensePeriod = range ? 'AND e.date >= ? AND e.date <= ?' : '';

  const [sales, purchases, expenses] = await Promise.all([
    db.getAllAsync<ActivityRow>(
      `SELECT 'sale' as act_type, s.id, s.invoice_no as ref, s.party_name as party,
              s.total_amount as amount, s.date, s.created_at, s.invoice_type
       FROM sales s
       WHERE EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
         ${salePeriod}
       ORDER BY s.date DESC, s.created_at DESC
       LIMIT ?`,
      saleParams
    ),
    db.getAllAsync<ActivityRow>(
      `SELECT 'purchase' as act_type, p.id, p.invoice_no as ref, p.supplier_name as party,
              p.total_amount as amount, p.date, p.created_at, NULL as invoice_type
       FROM purchases p
       WHERE EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = p.id)
         ${purchasePeriod}
       ORDER BY p.date DESC, p.created_at DESC
       LIMIT ?`,
      purchaseParams
    ),
    db.getAllAsync<ActivityRow>(
      `SELECT 'expense' as act_type, e.id, e.category as ref, e.description as party,
              e.amount, e.date, e.created_at, NULL as invoice_type
       FROM expenses e
       JOIN accounts a ON a.id = e.account_id
       WHERE COALESCE(a.is_excluded, 0) = 0
         ${expensePeriod}
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT ?`,
      expenseParams
    ),
  ]);
  return { sales, purchases, expenses };
}

export async function getRecentActivities(limit = 10): Promise<ActivityItem[]> {
  const { sales, purchases, expenses } = await queryRecentByType(limit);
  return [...sales, ...purchases, ...expenses]
    .sort((a, b) => {
      const dateOrder = b.date.localeCompare(a.date);
      if (dateOrder !== 0) return dateOrder;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit)
    .map(mapRow);
}

/** Recent items grouped by category for the dashboard. */
export async function getRecentActivitiesGrouped(
  perCategory = 5,
  periodKey?: string
): Promise<GroupedRecentActivity> {
  const { sales, purchases, expenses } = await queryRecentByType(perCategory, periodKey);
  return {
    sales: sales.map(mapRow),
    purchases: purchases.map(mapRow),
    expenses: expenses.map(mapRow),
  };
}

import { getDatabase } from '../db/database';

export interface ActivityItem {
  id: string;
  type: 'sale' | 'purchase' | 'expense';
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  refId: number;
}

export async function getRecentActivities(limit = 10): Promise<ActivityItem[]> {
  const db = await getDatabase();
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
  const [sales, purchases, expenses] = await Promise.all([
    db.getAllAsync<ActivityRow>(
      `SELECT 'sale' as act_type, id, invoice_no as ref, party_name as party,
              total_amount as amount, date, created_at, invoice_type
       FROM sales
       WHERE EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = sales.id)
       ORDER BY date DESC, created_at DESC
       LIMIT ?`,
      [limit]
    ),
    db.getAllAsync<ActivityRow>(
      `SELECT 'purchase' as act_type, id, invoice_no as ref, supplier_name as party,
              total_amount as amount, date, created_at, NULL as invoice_type
       FROM purchases
       WHERE EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = purchases.id)
       ORDER BY date DESC, created_at DESC
       LIMIT ?`,
      [limit]
    ),
    db.getAllAsync<ActivityRow>(
      `SELECT 'expense' as act_type, id, category as ref, description as party,
              amount, date, created_at, NULL as invoice_type
       FROM expenses
       ORDER BY date DESC, created_at DESC
       LIMIT ?`,
      [limit]
    ),
  ]);

  const rows = [...sales, ...purchases, ...expenses]
    .sort((a, b) => {
      const dateOrder = b.date.localeCompare(a.date);
      if (dateOrder !== 0) return dateOrder;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit);

  return rows.map((r) => {
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
  });
}

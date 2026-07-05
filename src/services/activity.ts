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
  const rows = await db.getAllAsync<{
    act_type: string;
    id: number;
    ref: string;
    party: string;
    amount: number;
    date: string;
    created_at: string;
  }>(`
    SELECT act_type, id, ref, party, amount, date, created_at FROM (
      SELECT 'sale' as act_type, id, invoice_no as ref, party_name as party, total_amount as amount, date, created_at
      FROM sales
      UNION ALL
      SELECT 'purchase', id, invoice_no, supplier_name, total_amount, date, created_at
      FROM purchases
      UNION ALL
      SELECT 'expense', id, category, description, amount, date, created_at
      FROM expenses
    )
    ORDER BY date DESC, created_at DESC
    LIMIT ?
  `, [limit]);

  return rows.map((r) => ({
    id: `${r.act_type}-${r.id}`,
    type: r.act_type as ActivityItem['type'],
    title: r.ref,
    subtitle: r.party,
    amount: r.amount,
    date: r.date,
    refId: r.id,
  }));
}

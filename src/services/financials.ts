import { getDatabase, repairFinancialDataIntegrity } from '../db/database';
import { addMoney, mulMoney, roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import type { Sale, SaleItem } from '../types';

/** Effective unit cost per line — prefers stored cost, then movement, then product avg. */
export const SALE_LINE_UNIT_COST_SQL = `
  COALESCE(
    NULLIF(si.unit_cost, 0),
    (SELECT ABS(im.unit_cost) FROM inventory_movements im
     WHERE im.reference_type = 'sale' AND im.reference_id = si.sale_id
       AND im.product_id = si.product_id AND im.type = 'sale'
     LIMIT 1),
    p.avg_cost,
    0
  )
`;

export function calculateSaleCogs(
  _sale: Pick<Sale, 'subtotal' | 'discount_amount'>,
  items: Pick<SaleItem, 'unit_cost' | 'qty'>[]
): number {
  // Discount reduces what the customer pays, not what the goods cost you.
  return addMoney(...items.map((item) => mulMoney(item.unit_cost, item.qty)));
}

export function calculateSaleGrossProfit(
  sale: Pick<Sale, 'subtotal' | 'discount_amount' | 'total_amount'>,
  items: Pick<SaleItem, 'unit_cost' | 'qty'>[]
): number {
  return roundMoney(sale.total_amount - calculateSaleCogs(sale, items));
}

export interface PeriodFinancials {
  revenue: number;
  cogs: number;
  grossProfit: number;
  otherIncome: number;
  expenses: number;
  netProfit: number;
}

export async function getPeriodFinancials(
  periodKey: string,
  range?: { start: string; end: string }
): Promise<PeriodFinancials> {
  await repairFinancialDataIntegrity();
  const db = await getDatabase();
  const { start, end } = range ?? (await resolvePeriodRange(periodKey));

  const [revenue, cogs, expenses, otherIncome] = await Promise.all([
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(s.total_amount), 0) as total
       FROM sales s
       WHERE s.date >= ? AND s.date <= ?
         AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)`,
      [start, end]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(
         ${SALE_LINE_UNIT_COST_SQL} * si.qty
       ), 0) as total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.date >= ? AND s.date <= ?`,
      [start, end]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= ? AND date <= ?`,
      [start, end]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(oi.amount), 0) as total FROM other_income oi
       JOIN accounts a ON a.id = oi.account_id
       WHERE oi.date >= ? AND oi.date <= ? AND COALESCE(a.is_excluded, 0) = 0`,
      [start, end]
    ),
  ]);

  const rev = roundMoney(revenue?.total ?? 0);
  const cost = roundMoney(cogs?.total ?? 0);
  const exp = roundMoney(expenses?.total ?? 0);
  const other = roundMoney(otherIncome?.total ?? 0);
  const gross = roundMoney(rev - cost);

  return {
    revenue: rev,
    cogs: cost,
    grossProfit: gross,
    otherIncome: other,
    expenses: exp,
    netProfit: roundMoney(gross + other - exp),
  };
}

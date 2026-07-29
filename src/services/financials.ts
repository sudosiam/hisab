import { getDatabase } from '../db/database';
import { addMoney, mulMoney, roundMoney } from '../utils/money';
import { resolvePeriodRange } from '../utils/period';
import type { Sale, SaleItem } from '../types';

/** Effective unit cost per line — repair fills stored costs; product avg is a legacy fallback. */
export const SALE_LINE_UNIT_COST_SQL = `
  COALESCE(
    NULLIF(si.unit_cost, 0),
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

export type AccountingBasis = 'accrual' | 'cash';

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
  range?: { start: string; end: string },
  basis: AccountingBasis = 'accrual'
): Promise<PeriodFinancials> {
  const db = await getDatabase();
  const { start, end } = range ?? (await resolvePeriodRange(periodKey));

  const [revenue, cogs, expenses, otherIncome] = await Promise.all([
    basis === 'cash'
      ? db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(sp.amount), 0) as total
           FROM sale_payments sp
           JOIN accounts a ON a.id = sp.account_id
           WHERE sp.date >= ? AND sp.date <= ?
             AND COALESCE(a.is_excluded, 0) = 0`,
          [start, end]
        )
      : db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(s.total_amount), 0) as total
           FROM sales s
           WHERE s.date >= ? AND s.date <= ?
             AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)`,
          [start, end]
        ),
    basis === 'cash'
      ? db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(
             (
               SELECT COALESCE(SUM(${SALE_LINE_UNIT_COST_SQL} * si.qty), 0)
               FROM sale_items si
               JOIN products p ON p.id = si.product_id
               WHERE si.sale_id = s.id
             ) * (sp.amount * 1.0 / NULLIF(s.total_amount, 0))
           ), 0) as total
           FROM sale_payments sp
           JOIN sales s ON s.id = sp.sale_id
           JOIN accounts a ON a.id = sp.account_id
           WHERE sp.date >= ? AND sp.date <= ?
             AND COALESCE(a.is_excluded, 0) = 0
             AND s.total_amount > 0`,
          [start, end]
        )
      : db.getFirstAsync<{ total: number }>(
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
      `SELECT COALESCE(SUM(e.amount), 0) as total FROM expenses e
       JOIN accounts a ON a.id = e.account_id
       WHERE e.date >= ? AND e.date <= ? AND COALESCE(a.is_excluded, 0) = 0`,
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

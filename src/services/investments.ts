import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';

const OWNER_INVESTMENT_KEY = 'owner_investment';
const OWNER_INVESTMENT_UPDATED_KEY = 'owner_investment_updated_at';

export interface InvestmentInfo {
  amount: number;
  isSet: boolean;
  updatedAt: string | null;
}

export async function getInvestmentInfo(): Promise<InvestmentInfo> {
  const db = await getDatabase();
  const [setting, updated] = await Promise.all([
    db.getFirstAsync<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [
      OWNER_INVESTMENT_KEY,
    ]),
    db.getFirstAsync<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [
      OWNER_INVESTMENT_UPDATED_KEY,
    ]),
  ]);

  if (setting?.value !== undefined && setting.value !== '') {
    const parsed = parseFloat(setting.value);
    if (!Number.isNaN(parsed)) {
      return {
        amount: roundMoney(Math.max(0, parsed)),
        isSet: true,
        updatedAt: updated?.value ?? null,
      };
    }
  }

  return { amount: 0, isSet: false, updatedAt: null };
}

export async function getOwnerInvestment(): Promise<number> {
  const info = await getInvestmentInfo();
  return info.amount;
}

export async function setOwnerInvestment(amount: number): Promise<void> {
  if (amount < 0) throw new Error('Investment amount cannot be negative');

  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [
    OWNER_INVESTMENT_KEY,
    String(roundMoney(amount)),
  ]);
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [
    OWNER_INVESTMENT_UPDATED_KEY,
    now,
  ]);
}

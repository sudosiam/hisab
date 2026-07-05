import { getDatabase } from '../db/database';
import { roundMoney } from '../utils/money';

const OWNER_INVESTMENT_KEY = 'owner_investment';

export interface InvestmentInfo {
  amount: number;
  isSet: boolean;
}

export async function getInvestmentInfo(): Promise<InvestmentInfo> {
  const db = await getDatabase();
  const setting = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [OWNER_INVESTMENT_KEY]
  );

  if (setting?.value !== undefined && setting.value !== '') {
    const parsed = parseFloat(setting.value);
    if (!Number.isNaN(parsed)) {
      return {
        amount: roundMoney(Math.max(0, parsed)),
        isSet: true,
      };
    }
  }

  return { amount: 0, isSet: false };
}

export async function getOwnerInvestment(): Promise<number> {
  const info = await getInvestmentInfo();
  return info.amount;
}

export async function setOwnerInvestment(amount: number): Promise<void> {
  if (amount < 0) throw new Error('Investment amount cannot be negative');

  const db = await getDatabase();
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [
    OWNER_INVESTMENT_KEY,
    String(roundMoney(amount)),
  ]);
}

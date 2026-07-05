import { getFinancialYearStartMonth } from '../services/appSettings';
import { getPeriodRange, isFinancialYearPeriodKey } from './date';

export async function resolvePeriodRange(periodKey: string): Promise<{ start: string; end: string }> {
  if (isFinancialYearPeriodKey(periodKey)) {
    const startMonth = await getFinancialYearStartMonth();
    return getPeriodRange(periodKey, startMonth);
  }
  return getPeriodRange(periodKey);
}

import { getFinancialYearStartMonth } from '../services/appSettings';
import { getPeriodRange, isAllPeriodKey, isFinancialYearPeriodKey } from './date';

export async function resolvePeriodRange(periodKey: string): Promise<{ start: string; end: string }> {
  if (isAllPeriodKey(periodKey)) {
    return getPeriodRange(periodKey);
  }
  if (isFinancialYearPeriodKey(periodKey)) {
    const startMonth = await getFinancialYearStartMonth();
    return getPeriodRange(periodKey, startMonth);
  }
  return getPeriodRange(periodKey);
}

import { useEffect, useState } from 'react';
import { useFinancialYear } from '../context/FinancialYearContext';
import { getCurrentMonthKey, syncPeriodKeyWithFinancialYear } from '../utils/date';

/** Period picker state that stays aligned with the FY chosen in Settings. */
export function useSyncedPeriodKey(initialKey = getCurrentMonthKey()) {
  const { selectedFyStartYear, fyRevision } = useFinancialYear();
  const [periodKey, setPeriodKey] = useState(initialKey);

  useEffect(() => {
    setPeriodKey((current) => syncPeriodKeyWithFinancialYear(current, selectedFyStartYear));
  }, [selectedFyStartYear, fyRevision]);

  return [periodKey, setPeriodKey] as const;
}

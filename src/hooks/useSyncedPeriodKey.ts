import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFinancialYear } from '../context/FinancialYearContext';
import { getCurrentMonthKey, syncPeriodKeyWithFinancialYear } from '../utils/date';

const STORAGE_KEY = '@hisab/shared_period_key';

/** In-memory period shared by every screen that uses this hook. */
let memoryPeriod: string | null = null;
const listeners = new Set<(key: string) => void>();

function publish(key: string) {
  memoryPeriod = key;
  for (const listener of listeners) listener(key);
}

/**
 * Period picker state aligned with the FY in Settings and shared across
 * drawer screens (dashboard → sales keeps the same month).
 */
export function useSyncedPeriodKey(initialKey = getCurrentMonthKey()) {
  const { selectedFyStartYear, fyRevision } = useFinancialYear();
  const [periodKey, setPeriodKeyState] = useState(() => memoryPeriod ?? initialKey);

  useEffect(() => {
    const listener = (key: string) => setPeriodKeyState(key);
    listeners.add(listener);
    if (memoryPeriod != null) setPeriodKeyState(memoryPeriod);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (memoryPeriod != null) return;
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (cancelled || memoryPeriod != null) return;
      const synced = syncPeriodKeyWithFinancialYear(
        stored ?? getCurrentMonthKey(),
        selectedFyStartYear
      );
      void AsyncStorage.setItem(STORAGE_KEY, synced);
      publish(synced);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFyStartYear]);

  useEffect(() => {
    if (memoryPeriod == null) return;
    const next = syncPeriodKeyWithFinancialYear(memoryPeriod, selectedFyStartYear);
    if (next === memoryPeriod) return;
    void AsyncStorage.setItem(STORAGE_KEY, next);
    publish(next);
  }, [selectedFyStartYear, fyRevision]);

  const setPeriodKey = useCallback(
    (next: string) => {
      const synced = syncPeriodKeyWithFinancialYear(next, selectedFyStartYear);
      void AsyncStorage.setItem(STORAGE_KEY, synced);
      publish(synced);
    },
    [selectedFyStartYear]
  );

  return [periodKey, setPeriodKey] as const;
}

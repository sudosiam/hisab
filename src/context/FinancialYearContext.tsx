import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { FinancialYearOption } from '../components/FinancialYearPicker';
import {
  getFinancialYearStartMonth,
  setFinancialYearStartMonth,
  setSelectedFinancialYearStartYear,
  syncSelectedFinancialYearToCurrent,
} from '../services/appSettings';
import { getFinancialYearSelectOptions } from '../utils/date';
import { useDatabase } from './DatabaseContext';

interface FinancialYearContextValue {
  ready: boolean;
  fyStartMonth: number;
  selectedFyStartYear: number;
  fyOptions: FinancialYearOption[];
  fyRevision: number;
  savingFy: boolean;
  setFyStartMonth: (month: number) => Promise<void>;
  setSelectedFyStartYear: (startYear: number) => Promise<void>;
  reload: () => Promise<void>;
}

const FinancialYearContext = createContext<FinancialYearContextValue>({
  ready: false,
  fyStartMonth: 4,
  selectedFyStartYear: 2025,
  fyOptions: [],
  fyRevision: 0,
  savingFy: false,
  setFyStartMonth: async () => {},
  setSelectedFyStartYear: async () => {},
  reload: async () => {},
});

export function FinancialYearProvider({ children }: { children: React.ReactNode }) {
  const { ready: dbReady, refreshKey, refresh } = useDatabase();
  const [fyStartMonth, setFyStartMonthState] = useState(4);
  const [selectedFyStartYear, setSelectedFyStartYearState] = useState(2025);
  const [fyOptions, setFyOptions] = useState<FinancialYearOption[]>([]);
  const [fyRevision, setFyRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [savingFy, setSavingFy] = useState(false);
  const previousSettings = useRef({ month: 4, year: 2025 });

  const reload = useCallback(async () => {
    const startMonth = await getFinancialYearStartMonth();
    const selectedYear = await syncSelectedFinancialYearToCurrent();
    const changed =
      previousSettings.current.month !== startMonth ||
      previousSettings.current.year !== selectedYear;
    previousSettings.current = { month: startMonth, year: selectedYear };
    setFyStartMonthState(startMonth);
    setSelectedFyStartYearState(selectedYear);
    setFyOptions(getFinancialYearSelectOptions(startMonth, new Date(), 4, 2, selectedYear));
    setLoaded(true);
    if (changed) {
      setFyRevision((revision) => revision + 1);
    }
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    reload().catch(() => {});
  }, [dbReady, refreshKey, reload]);

  useEffect(() => {
    if (!dbReady) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reload().catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [dbReady, reload]);

  const setFyStartMonth = useCallback(
    async (month: number) => {
      if (month === fyStartMonth || savingFy) return;
      setSavingFy(true);
      const prev = fyStartMonth;
      setFyStartMonthState(month);
      try {
        await setFinancialYearStartMonth(month);
        await reload();
        refresh();
      } catch {
        setFyStartMonthState(prev);
        throw new Error('Could not save start month');
      } finally {
        setSavingFy(false);
      }
    },
    [fyStartMonth, savingFy, reload, refresh]
  );

  const setSelectedFyStartYear = useCallback(
    async (startYear: number) => {
      if (startYear === selectedFyStartYear || savingFy) return;
      setSavingFy(true);
      setSelectedFyStartYearState(startYear);
      try {
        await setSelectedFinancialYearStartYear(startYear);
        await reload();
        refresh();
      } catch {
        await reload();
        throw new Error('Could not save financial year');
      } finally {
        setSavingFy(false);
      }
    },
    [selectedFyStartYear, savingFy, reload, refresh]
  );

  const value = useMemo(
    () => ({
      ready: loaded,
      fyStartMonth,
      selectedFyStartYear,
      fyOptions,
      fyRevision,
      savingFy,
      setFyStartMonth,
      setSelectedFyStartYear,
      reload,
    }),
    [
      loaded,
      fyStartMonth,
      selectedFyStartYear,
      fyOptions,
      fyRevision,
      savingFy,
      setFyStartMonth,
      setSelectedFyStartYear,
      reload,
    ]
  );

  return <FinancialYearContext.Provider value={value}>{children}</FinancialYearContext.Provider>;
}

export function useFinancialYear() {
  return useContext(FinancialYearContext);
}

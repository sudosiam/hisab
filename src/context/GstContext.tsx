import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { isGstEnabled, setGstEnabled as persistGstEnabled } from '../services/appSettings';

interface GstContextValue {
  /** When false, hide GST UI and treat documents as untaxed. */
  gstEnabled: boolean;
  ready: boolean;
  reload: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
}

const GstContext = createContext<GstContextValue>({
  gstEnabled: true,
  ready: false,
  reload: async () => {},
  setEnabled: async () => {},
});

export function GstProvider({ children }: { children: React.ReactNode }) {
  const [gstEnabled, setGstEnabledState] = useState(true);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      setGstEnabledState(await isGstEnabled());
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    await persistGstEnabled(enabled);
    setGstEnabledState(enabled);
  }, []);

  const value = useMemo(
    () => ({ gstEnabled, ready, reload, setEnabled }),
    [gstEnabled, ready, reload, setEnabled]
  );

  return <GstContext.Provider value={value}>{children}</GstContext.Provider>;
}

/** Universal GST on/off — use everywhere UI or copy depends on tax mode. */
export function useGstEnabled(): boolean {
  return useContext(GstContext).gstEnabled;
}

export function useGstSettings(): GstContextValue {
  return useContext(GstContext);
}

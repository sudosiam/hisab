import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { alertRefreshFailed } from '../utils/uiFeedback';

export interface FocusRefreshState {
  /** True only until the first load settles (show full-screen spinner). */
  booting: boolean;
  /** Set when the most recent load failed and no data has ever been shown. */
  error: string | null;
  /** Re-run the loader manually (used by error-state retry buttons). */
  retry: () => void;
}

/**
 * Reload on focus without blanking the screen when data was already shown.
 * First-load failures surface via `error`; later refresh failures alert.
 */
export function useFocusRefresh(loader: () => Promise<void>, deps: unknown[]): FocusRefreshState {
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasShownData = useRef(false);
  const mountedRef = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback((isActive: () => boolean) => {
    if (!hasShownData.current) setBooting(true);

    loaderRef
      .current()
      .then(() => {
        if (!isActive()) return;
        hasShownData.current = true;
        setError(null);
      })
      .catch((e) => {
        if (!isActive()) return;
        if (!hasShownData.current) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        } else {
          alertRefreshFailed(e);
        }
      })
      .finally(() => {
        if (isActive()) setBooting(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      run(() => active);
      return () => {
        active = false;
      };
      // Caller-controlled dependency list triggers reload when inputs change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, ...deps])
  );

  const retry = useCallback(() => {
    setError(null);
    run(() => mountedRef.current);
  }, [run]);

  return { booting: booting && !hasShownData.current, error, retry };
}

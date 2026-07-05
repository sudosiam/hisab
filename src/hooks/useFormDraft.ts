import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraft, saveDraft, type DraftKey } from '../services/formDrafts';

export function useFormDraft<T>(
  key: DraftKey,
  data: T,
  options: {
    enabled?: boolean;
    isEmpty: (data: T) => boolean;
    debounceMs?: number;
  }
) {
  const { enabled = true, isEmpty, debounceMs = 1000 } = options;
  const [ready, setReady] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const skipSave = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingSave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistDraft = useCallback(async () => {
    if (!enabled || !ready) return;
    if (isEmpty(data)) {
      await clearDraft(key);
      setHasDraft(false);
      return;
    }
    await saveDraft(key, data);
    setHasDraft(true);
  }, [key, data, enabled, ready, isEmpty]);

  useEffect(() => {
    if (!enabled || !ready) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistDraft().catch(() => {});
    }, debounceMs);
    return cancelPendingSave;
  }, [data, enabled, ready, debounceMs, persistDraft, cancelPendingSave]);

  const markReady = useCallback(() => {
    setReady(true);
  }, []);

  const discardDraft = useCallback(async () => {
    cancelPendingSave();
    await clearDraft(key);
    setHasDraft(false);
    skipSave.current = true;
  }, [key, cancelPendingSave]);

  const clearDraftOnSave = useCallback(async () => {
    cancelPendingSave();
    await clearDraft(key);
    setHasDraft(false);
    skipSave.current = true;
  }, [key, cancelPendingSave]);

  const noteDraftLoaded = useCallback(() => {
    setHasDraft(true);
  }, []);

  return {
    markReady,
    discardDraft,
    clearDraftOnSave,
    hasDraft,
    noteDraftLoaded,
  };
}

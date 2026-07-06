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
  const dataRef = useRef(data);
  dataRef.current = data;

  const cancelPendingSave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistDraft = useCallback(async () => {
    if (!enabled || !ready) return;
    const payload = dataRef.current;
    if (isEmpty(payload)) {
      await clearDraft(key);
      setHasDraft(false);
      return;
    }
    await saveDraft(key, payload);
    setHasDraft(true);
  }, [key, enabled, ready, isEmpty]);

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

  useEffect(() => {
    return () => {
      cancelPendingSave();
      if (!enabled || !ready || skipSave.current) return;
      const payload = dataRef.current;
      if (isEmpty(payload)) {
        clearDraft(key).catch(() => {});
      } else {
        saveDraft(key, payload).catch(() => {});
      }
    };
  }, [cancelPendingSave, enabled, isEmpty, key, ready]);

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

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
  const { enabled = true, isEmpty, debounceMs = 600 } = options;
  const [ready, setReady] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const skipSave = useRef(true);
  const disposed = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  const isEmptyRef = useRef(isEmpty);
  dataRef.current = data;
  isEmptyRef.current = isEmpty;

  const cancelPendingSave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistDraft = useCallback(async () => {
    if (!enabled || !ready || skipSave.current || disposed.current) return;
    const payload = dataRef.current;
    if (isEmptyRef.current(payload)) {
      await clearDraft(key);
      return;
    }
    await saveDraft(key, payload);
  }, [key, enabled, ready]);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      cancelPendingSave();
      if (!enabled || !ready || skipSave.current) return;
      const payload = dataRef.current;
      if (isEmptyRef.current(payload)) {
        clearDraft(key).catch((err) => console.warn('[draft] clear failed', key, err));
      } else {
        saveDraft(key, payload).catch((err) => console.warn('[draft] persist failed', key, err));
      }
    };
  }, [cancelPendingSave, enabled, key, ready]);

  // Banner follows form dirtiness immediately — do not wait for debounced save.
  useEffect(() => {
    if (!enabled || !ready) return;
    setHasDraft(!isEmpty(data));
  }, [data, enabled, ready, isEmpty]);

  useEffect(() => {
    if (!enabled || !ready) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistDraft().catch((err) => console.warn('[draft] persist failed', key, err));
    }, debounceMs);
    return cancelPendingSave;
  }, [data, enabled, ready, debounceMs, persistDraft, cancelPendingSave, key]);

  const markReady = useCallback(() => {
    setReady(true);
  }, []);

  const discardDraft = useCallback(async () => {
    cancelPendingSave();
    await clearDraft(key);
    setHasDraft(false);
  }, [key, cancelPendingSave]);

  const clearDraftOnSave = useCallback(async () => {
    skipSave.current = true;
    cancelPendingSave();
    await clearDraft(key);
    setHasDraft(false);
  }, [key, cancelPendingSave]);

  const noteDraftLoaded = useCallback(() => {
    setHasDraft(true);
  }, []);

  return {
    ready,
    markReady,
    discardDraft,
    clearDraftOnSave,
    hasDraft,
    noteDraftLoaded,
  };
}

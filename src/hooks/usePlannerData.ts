import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { repository } from "../lib/persistence/repository";
import { createEmptyData } from "../lib/plannerData";
import type { PlannerData } from "../types/planner";

const SAVE_DEBOUNCE_MS = 400;

export interface PlannerDataApi {
  data: PlannerData;
  setData: React.Dispatch<React.SetStateAction<PlannerData>>;
  replaceData: (data: PlannerData) => void;
  loading: boolean;
  storageError: string | null;
  dismissStorageError: () => void;
}

export function usePlannerData(): PlannerDataApi {
  const [data, setData] = useState<PlannerData>(createEmptyData);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Guards the write that would otherwise fire immediately after load and
  // after a change arriving from another tab.
  const skipNextSave = useRef(true);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    repository.load().then((loaded) => {
      if (cancelled) {
        return;
      }
      skipNextSave.current = true;
      setData(loaded);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return repository.onQuotaError(() => {
      setStorageError(
        "Momentum could not save to browser storage. Export a backup from the Data view before continuing.",
      );
    });
  }, []);

  // Changes broadcast by another tab land here; applying them must not trigger
  // a save that would echo back.
  useEffect(() => {
    return repository.subscribe((incoming) => {
      skipNextSave.current = true;
      setData(incoming);
    });
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(() => {
      void repository.save({ ...data, updatedAt: new Date().toISOString() });
      saveTimer.current = null;
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [data, loading]);

  const replaceData = useCallback((next: PlannerData) => {
    setData(next);
  }, []);

  const dismissStorageError = useCallback(() => setStorageError(null), []);

  return useMemo(
    () => ({ data, setData, replaceData, loading, storageError, dismissStorageError }),
    [data, replaceData, loading, storageError, dismissStorageError],
  );
}

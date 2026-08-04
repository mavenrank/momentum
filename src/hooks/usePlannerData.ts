import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeSnapshot } from "../lib/persistence/folderBackup";
import { repository } from "../lib/persistence/repository";
import { requestPersistentStorage } from "../lib/persistence/storagePersistence";
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

    // Asked for once per session, before the first write. A browser that grants
    // it will not evict this origin under disk pressure; one that refuses costs
    // nothing but the promise.
    void requestPersistentStorage();

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
    return repository.onQuotaError((error) => {
      // "Could not save" on its own is unactionable — the browser's own message
      // is the only thing that distinguishes a full disk from a failed upgrade
      // from a private-window restriction.
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error === "string"
            ? error
            : "Unknown error.";

      setStorageError(
        `Momentum could not write to browser storage — ${detail} Your work is safe in this tab, but it is not being saved. Export a backup from the Data view.`,
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
      const next = { ...data, updatedAt: new Date().toISOString() };
      void repository.save(next);
      // Rate-limited internally, so calling it on every save is cheap; it only
      // touches the disk once the interval has passed.
      void writeSnapshot(next).catch(() => undefined);
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

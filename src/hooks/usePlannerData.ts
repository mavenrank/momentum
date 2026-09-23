import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeSnapshot } from "../lib/persistence/folderBackup";
import { repository } from "../lib/persistence/repository";
import { requestPersistentStorage } from "../lib/persistence/storagePersistence";
import {
  executePlannerCommand,
  type PlannerCommand,
  type PlannerCommandExecutor,
  type CommandContext,
} from "../lib/application/commands";
import { createEmptyData } from "../lib/plannerData";
import { consolidateDuplicateDomains } from "../lib/organization";
import type { PlannerData } from "../types/planner";

const SAVE_DEBOUNCE_MS = 400;

export interface PlannerDataApi {
  data: PlannerData;
  execute: PlannerCommandExecutor;
  replaceData: (data: PlannerData) => void;
  loading: boolean;
  storageError: string | null;
  dismissStorageError: () => void;
}

export function usePlannerData(): PlannerDataApi {
  const [data, setData] = useState<PlannerData>(createEmptyData);
  const dataRef = useRef(data);
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

    repository.load().then(async (loaded) => {
      if (cancelled) {
        return;
      }
      const consolidated = consolidateDuplicateDomains(loaded);
      if (consolidated !== loaded) {
        await repository.save(consolidated);
        loaded = consolidated;
      }
      skipNextSave.current = true;
      dataRef.current = loaded;
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
        `Momentum could not write to browser storage — ${detail} Your work is safe in this tab, but it is not being saved. Export a backup from Settings → Data.`,
      );
    });
  }, []);

  // Changes broadcast by another tab land here; applying them must not trigger
  // a save that would echo back.
  useEffect(() => {
    return repository.subscribe((incoming) => {
      skipNextSave.current = true;
      dataRef.current = incoming;
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

  const execute = useCallback(
    (command: PlannerCommand, context?: CommandContext) => {
      const result = executePlannerCommand(dataRef.current, command, context);
      if (result.ok && result.data !== dataRef.current) {
        dataRef.current = result.data;
        setData(result.data);
      }
      return result;
    },
    [],
  );

  const replaceData = useCallback((next: PlannerData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const dismissStorageError = useCallback(() => setStorageError(null), []);

  return useMemo(
    () => ({ data, execute, replaceData, loading, storageError, dismissStorageError }),
    [data, execute, replaceData, loading, storageError, dismissStorageError],
  );
}

import { db, habitLogKey, META_KEYS } from "./db";
import { runMigrations } from "./migrations";
import { createEmptyData, normalizePlannerData } from "../plannerData";
import type { PlannerData } from "../../types/planner";

const LEGACY_STORAGE_KEY = "momentum.planner.v1";
const CHANNEL_NAME = "momentum.sync";

export type QuotaErrorHandler = (error: unknown) => void;

export interface Repository {
  load: () => Promise<PlannerData>;
  save: (data: PlannerData) => Promise<void>;
  subscribe: (listener: (data: PlannerData) => void) => () => void;
  onQuotaError: (handler: QuotaErrorHandler) => () => void;
}

/* ------------------------------------------------------------ read/write -- */

async function readAll(): Promise<PlannerData | null> {
  const [daily, weekly, habits, habitLogs, areas, meta] = await Promise.all([
    db.daily.toArray(),
    db.weekly.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.areas.toArray(),
    db.meta.toArray(),
  ]);

  const metaMap = new Map(meta.map((row) => [row.key, row.value]));
  if (metaMap.get(META_KEYS.version) === undefined) {
    return null;
  }

  return normalizePlannerData({
    version: 2,
    daily: Object.fromEntries(daily.map((entry) => [entry.date, entry])),
    weekly: Object.fromEntries(weekly.map((entry) => [entry.weekStart, entry])),
    habits,
    habitLogs: habitLogs.map(({ habitId, date, done }) => ({ habitId, date, done })),
    areas,
    nextTaskId: (metaMap.get(META_KEYS.nextTaskId) as number) ?? 1,
    updatedAt: (metaMap.get(META_KEYS.updatedAt) as string) ?? new Date().toISOString(),
  });
}

async function writeAll(data: PlannerData): Promise<void> {
  await db.transaction(
    "rw",
    [db.daily, db.weekly, db.habits, db.habitLogs, db.areas, db.meta],
    async () => {
      await Promise.all([
        db.daily.clear(),
        db.weekly.clear(),
        db.habits.clear(),
        db.habitLogs.clear(),
        db.areas.clear(),
      ]);

      await Promise.all([
        db.daily.bulkPut(Object.values(data.daily)),
        db.weekly.bulkPut(Object.values(data.weekly)),
        db.habits.bulkPut(data.habits),
        db.habitLogs.bulkPut(
          data.habitLogs.map((log) => ({ ...log, id: habitLogKey(log.habitId, log.date) })),
        ),
        db.areas.bulkPut(data.areas),
        db.meta.bulkPut([
          { key: META_KEYS.version, value: data.version },
          { key: META_KEYS.nextTaskId, value: data.nextTaskId },
          { key: META_KEYS.updatedAt, value: data.updatedAt },
        ]),
      ]);
    },
  );
}

/* -------------------------------------------------------- legacy import -- */

/**
 * Reads the v1 localStorage payload, runs it through the migration registry and
 * writes the result to IndexedDB. The legacy key is only removed once the write
 * has succeeded, so a failure mid-way leaves the original data recoverable.
 */
async function importLegacyLocalStorage(): Promise<PlannerData | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const migrated = normalizePlannerData(
      runMigrations(parsed) as unknown as PlannerData,
    );
    await writeAll(migrated);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch (error) {
    console.error("Momentum: could not migrate the v1 localStorage payload.", error);
    return null;
  }
}

/* ------------------------------------------------------------ repository -- */

export function createRepository(): Repository {
  const quotaHandlers = new Set<QuotaErrorHandler>();
  const listeners = new Set<(data: PlannerData) => void>();

  const channel =
    typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
  const tabId = crypto.randomUUID();

  if (channel) {
    channel.onmessage = (event: MessageEvent) => {
      const message = event.data as { source?: string; data?: PlannerData } | null;
      if (!message?.data || message.source === tabId) {
        return;
      }
      for (const listener of listeners) {
        listener(normalizePlannerData(message.data));
      }
    };
  }

  function reportQuotaError(error: unknown) {
    for (const handler of quotaHandlers) {
      handler(error);
    }
  }

  return {
    async load() {
      try {
        const existing = await readAll();
        if (existing) {
          return existing;
        }

        const migrated = await importLegacyLocalStorage();
        if (migrated) {
          return migrated;
        }

        const empty = createEmptyData();
        await writeAll(empty);
        return empty;
      } catch (error) {
        console.error("Momentum: could not read from IndexedDB.", error);
        reportQuotaError(error);
        return createEmptyData();
      }
    },

    async save(data) {
      try {
        await writeAll(data);
        channel?.postMessage({ source: tabId, data });
      } catch (error) {
        console.error("Momentum: could not write to IndexedDB.", error);
        reportQuotaError(error);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    onQuotaError(handler) {
      quotaHandlers.add(handler);
      return () => quotaHandlers.delete(handler);
    },
  };
}

export const repository = createRepository();

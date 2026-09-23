import type { Table } from "dexie";

import {
  db,
  habitLogKey,
  META_KEYS,
  type AreaRow,
  type DomainRow,
  type DailyNoteRow,
  type HabitLogRow,
  type HabitRow,
  type PursuitRow,
  type TaskRow,
  type WeeklyRow,
} from "./db";
import { runMigrations } from "./migrations";
import { createTauriRepository, isTauriShell } from "./tauriRepository";
import { diffRecords, indexBy as index } from "./recordDiff";
import { createEmptyData, normalizePlannerData, taskHomeDate } from "../plannerData";
import { createDeviceTag, setDeviceTag } from "../taskId";
import type { DailyEntry, PlannerData } from "../../types/planner";

const LEGACY_STORAGE_KEY = "momentum.planner.v1";
const CHANNEL_NAME = "momentum.sync";

/**
 * How long a tombstone is kept before the row is dropped for real.
 *
 * A deletion has to outlive the longest plausible gap between a device syncing,
 * or a machine that was offline for the whole window would re-introduce what it
 * still thinks is a live record. Three months is generous for personal use.
 */
const TOMBSTONE_TTL_DAYS = 90;

export type QuotaErrorHandler = (error: unknown) => void;

export interface Repository {
  load: () => Promise<PlannerData>;
  save: (data: PlannerData) => Promise<void>;
  subscribe: (listener: (data: PlannerData) => void) => () => void;
  onQuotaError: (handler: QuotaErrorHandler) => () => void;
}

/* ------------------------------------------------------------- projection -- */

/** The database rows a given `PlannerData` describes. */
interface Projection {
  tasks: Map<string, TaskRow>;
  dailyNotes: Map<string, DailyNoteRow>;
  weekly: Map<string, WeeklyRow>;
  habits: Map<string, HabitRow>;
  habitLogs: Map<string, HabitLogRow>;
  areas: Map<string, AreaRow>;
  domains: Map<string, DomainRow>;
  pursuits: Map<string, PursuitRow>;
}

function project(data: PlannerData): Projection {
  const tasks: TaskRow[] = [];
  const dailyNotes: DailyNoteRow[] = [];

  for (const entry of Object.values(data.daily)) {
    for (const task of entry.tasks) {
      tasks.push({ ...task, homeDate: taskHomeDate(task) });
    }
    // An empty note on a day with no tasks is not worth a row.
    if (entry.note || entry.taskReferences.length > 0) {
      dailyNotes.push({
        date: entry.date,
        note: entry.note,
        taskReferences: entry.taskReferences,
        updatedAt: "",
      });
    }
  }

  return {
    tasks: index(tasks, (row) => row.id),
    dailyNotes: index(dailyNotes, (row) => row.date),
    weekly: index(
      Object.values(data.weekly).map((entry) => ({ ...entry, updatedAt: "" })),
      (row) => row.weekStart,
    ),
    habits: index(
      data.habits.map((habit) => ({ ...habit, updatedAt: "" })),
      (row) => row.id,
    ),
    habitLogs: index(
      data.habitLogs.map((log) => ({
        ...log,
        id: habitLogKey(log.habitId, log.date),
        updatedAt: "",
      })),
      (row) => row.id,
    ),
    areas: index(
      data.areas.map((area) => ({ ...area, updatedAt: "" })),
      (row) => row.id,
    ),
    domains: index(data.domains.map((domain) => ({ ...domain, updatedAt: "" })), (row) => row.id),
    pursuits: index(data.pursuits.map((pursuit) => ({ ...pursuit, updatedAt: "" })), (row) => row.id),
  };
}

function emptyProjection(): Projection {
  return {
    tasks: new Map(),
    dailyNotes: new Map(),
    weekly: new Map(),
    habits: new Map(),
    habitLogs: new Map(),
    areas: new Map(),
    domains: new Map(),
    pursuits: new Map(),
  };
}

/* ------------------------------------------------------------ read/write -- */

/** Drops the tombstone fields a row carries before it re-enters the app. */
function live<T extends { deletedAt?: string }>(rows: T[]): T[] {
  return rows.filter((row) => !row.deletedAt);
}

async function readAll(): Promise<{ data: PlannerData; rows: Projection; needsMigration: boolean } | null> {
  const [tasks, dailyNotes, weekly, habits, habitLogs, areas, domains, pursuits, meta] = await Promise.all([
    db.tasks.toArray(),
    db.dailyNotes.toArray(),
    db.weekly.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.areas.toArray(),
    db.domains.toArray(),
    db.pursuits.toArray(),
    db.meta.toArray(),
  ]);

  const metaMap = new Map(meta.map((row) => [row.key, row.value]));
  if (metaMap.get(META_KEYS.version) === undefined) {
    return null;
  }
  const storedVersion = Number(metaMap.get(META_KEYS.version));
  if (storedVersion > 4) throw new Error(`Unsupported future planner schema ${storedVersion}.`);

  const liveTasks = live(tasks);
  const liveNotes = live(dailyNotes);

  // Rebuild the day-keyed shape the app works in. A day exists if it holds
  // tasks, a note, or both.
  const daily: Record<string, DailyEntry> = {};
  const ensure = (date: string): DailyEntry =>
    (daily[date] ??= { date, tasks: [], note: "", taskReferences: [] });

  for (const task of liveTasks) {
    ensure(task.homeDate).tasks.push(task);
  }
  for (const note of liveNotes) {
    const entry = ensure(note.date);
    entry.note = note.note;
    entry.taskReferences = note.taskReferences;
  }

  const raw = {
    version: storedVersion,
    daily,
    weekly: Object.fromEntries(live(weekly).map((entry) => [entry.weekStart, entry])),
    habits: live(habits),
    habitLogs: live(habitLogs).map(({ habitId, date, done }) => ({ habitId, date, done })),
    areas: live(areas),
    domains: live(domains),
    pursuits: live(pursuits),
    nextTaskId: (metaMap.get(META_KEYS.nextTaskId) as number) ?? 1,
    updatedAt: (metaMap.get(META_KEYS.updatedAt) as string) ?? new Date().toISOString(),
  };
  const data = normalizePlannerData((storedVersion < 4 ? runMigrations(raw) : raw) as PlannerData);

  // The snapshot keeps the rows exactly as stored, tombstones included, so the
  // next diff knows what is already marked deleted.
  return {
    data,
    needsMigration: storedVersion < 4,
    rows: {
      tasks: index(tasks, (row) => row.id),
      dailyNotes: index(dailyNotes, (row) => row.date),
      weekly: index(weekly, (row) => row.weekStart),
      habits: index(habits, (row) => row.id),
      habitLogs: index(habitLogs, (row) => row.id),
      areas: index(areas, (row) => row.id),
      domains: index(domains, (row) => row.id),
      pursuits: index(pursuits, (row) => row.id),
    },
  };
}

/**
 * Runs one table's diff: writes what changed and folds the result back into the
 * snapshot, so the next save can diff without re-reading the database.
 */
function planWrite<T extends { updatedAt?: string; deletedAt?: string }>(
  table: Table,
  previous: Map<string, T>,
  next: Map<string, T>,
  key: (row: T) => string,
  now: string,
) {
  const changes = diffRecords(previous, next, now);
  const rows = [...changes.puts, ...changes.tombstones];

  return {
    rows,
    write: () => (rows.length === 0 ? Promise.resolve() : table.bulkPut(rows)),
    fold: (): Map<string, T> => {
      if (rows.length === 0) {
        return previous;
      }
      const map = new Map(previous);
      for (const row of rows) {
        map.set(key(row), row);
      }
      return map;
    },
  };
}

/** Applies only what changed, and returns the snapshot to diff against next. */
async function writeChanges(previous: Projection, data: PlannerData): Promise<Projection> {
  const now = new Date().toISOString();
  const next = project(data);

  const tasks = planWrite(db.tasks, previous.tasks, next.tasks, (row) => row.id, now);
  const dailyNotes = planWrite(
    db.dailyNotes,
    previous.dailyNotes,
    next.dailyNotes,
    (row) => row.date,
    now,
  );
  const weekly = planWrite(
    db.weekly,
    previous.weekly,
    next.weekly,
    (row) => row.weekStart,
    now,
  );
  const habits = planWrite(db.habits, previous.habits, next.habits, (row) => row.id, now);
  const habitLogs = planWrite(
    db.habitLogs,
    previous.habitLogs,
    next.habitLogs,
    (row) => row.id,
    now,
  );
  const areas = planWrite(db.areas, previous.areas, next.areas, (row) => row.id, now);
  const domains = planWrite(db.domains, previous.domains, next.domains, (row) => row.id, now);
  const pursuits = planWrite(db.pursuits, previous.pursuits, next.pursuits, (row) => row.id, now);

  const plans = [tasks, dailyNotes, weekly, habits, habitLogs, areas, domains, pursuits];
  const touched = plans.some((plan) => plan.rows.length > 0);

  await db.transaction(
    "rw",
    [db.tasks, db.dailyNotes, db.weekly, db.habits, db.habitLogs, db.areas, db.domains, db.pursuits, db.meta],
    async () => {
      await Promise.all(plans.map((plan) => plan.write()));

      await db.meta.bulkPut([
        { key: META_KEYS.version, value: data.version },
        { key: META_KEYS.nextTaskId, value: data.nextTaskId },
        { key: META_KEYS.updatedAt, value: touched ? now : data.updatedAt },
      ]);
    },
  );

  return {
    tasks: tasks.fold(),
    dailyNotes: dailyNotes.fold(),
    weekly: weekly.fold(),
    habits: habits.fold(),
    habitLogs: habitLogs.fold(),
    areas: areas.fold(),
    domains: domains.fold(),
    pursuits: pursuits.fold(),
  };
}

/**
 * Drops tombstones old enough that no device could still be carrying a stale
 * live copy. Runs on load, where a little extra work is invisible.
 */
async function purgeTombstones(): Promise<void> {
  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_DAYS * 86_400_000).toISOString();
  const tables: Table[] = [db.tasks, db.dailyNotes, db.weekly, db.habits, db.habitLogs, db.areas, db.domains, db.pursuits];

  await Promise.all(
    tables.map((table) =>
      table
        .where("deletedAt")
        .below(cutoff)
        .delete()
        .catch(() => 0),
    ),
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
    const migrated = normalizePlannerData(runMigrations(parsed) as unknown as PlannerData);
    await writeChanges(emptyProjection(), migrated);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch (error) {
    console.error("Momentum: could not migrate the v1 localStorage payload.", error);
    return null;
  }
}

/* ---------------------------------------------------------- device tag -- */

/** Reads this installation's tag, minting one the first time it is needed. */
async function loadDeviceTag(): Promise<string> {
  const existing = await db.meta.get(META_KEYS.deviceTag);
  if (typeof existing?.value === "string") {
    return existing.value;
  }

  const tag = createDeviceTag();
  await db.meta.put({ key: META_KEYS.deviceTag, value: tag });
  return tag;
}

/* ------------------------------------------------------------ repository -- */

export function createRepository(): Repository {
  const quotaHandlers = new Set<QuotaErrorHandler>();
  const listeners = new Set<(data: PlannerData) => void>();

  // What the database held after the last read or write by this tab.
  let snapshot = emptyProjection();
  let readable = true;

  const channel =
    typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
  const tabId = crypto.randomUUID();

  if (channel) {
    channel.onmessage = (event: MessageEvent) => {
      const message = event.data as { source?: string; data?: PlannerData } | null;
      if (!message?.data || message.source === tabId) {
        return;
      }
      // Another tab wrote these rows, so they are now what the database holds.
      snapshot = project(message.data);
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
        // Must happen before anything can create a task, since ID generation
        // reads the tag synchronously.
        setDeviceTag(await loadDeviceTag());
        await purgeTombstones();

        const existing = await readAll();
        if (existing) {
          snapshot = existing.needsMigration
            ? await writeChanges(existing.rows, existing.data)
            : existing.rows;
          return existing.data;
        }

        const migrated = await importLegacyLocalStorage();
        if (migrated) {
          snapshot = project(migrated);
          return migrated;
        }

        const empty = createEmptyData();
        snapshot = await writeChanges(emptyProjection(), empty);
        return empty;
      } catch (error) {
        readable = false;
        console.error("Momentum: could not read from IndexedDB.", error);
        reportQuotaError(error);
        return createEmptyData();
      }
    },

    async save(data) {
      if (!readable) return;
      try {
        snapshot = await writeChanges(snapshot, data);
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

/**
 * The backend is chosen once, by asking where we are running.
 *
 * Nothing above this line knows which one it got. That was the point of putting
 * the `Repository` interface here in the first place: the Dexie implementation
 * already stored tasks as rows, diffed before writing and stamped `updatedAt`,
 * so a second backend could be added without the app noticing. This is that
 * second backend, and the app did not have to change.
 */
export const repository: Repository = isTauriShell()
  ? createTauriRepository()
  : createRepository();

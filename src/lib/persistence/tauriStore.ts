import { normalizePlannerData } from "../plannerData";
import type {
  Area,
  DailyEntry,
  DailyTask,
  Habit,
  HabitLog,
  PlannerData,
  WeeklyEntry,
} from "../../types/planner";

/**
 * The on-disk shape of the planner store, and the pure functions that map
 * `PlannerData` on to it and back.
 *
 * This is deliberately the *same* layout `scripts/momentum-data.mjs` already
 * reads and writes — a folder of plain JSON, split by month of creation:
 *
 *     meta.json          schema version, the task-ID counter, last update time
 *     areas.json         areas and their colours
 *     habits.json        habit definitions
 *     habit-logs.json    daily habit ticks
 *     weeks.json         weekly notes, keyed by week start
 *     months/YYYY-MM.json  every task *created* that month, plus that month's
 *                          day notes
 *
 * Sharing the layout rather than inventing a second one is the whole reason to
 * prefer this over SQLite: the CLI keeps working unchanged, the folder stays
 * readable in git, and a bad write is something you can open in an editor and
 * see. The cost is that a very large dataset means rewriting whole month files,
 * which is why the split is by *creation* date — a past month's file stops
 * changing once the month is over, so the rewrite is bounded by how much you
 * created recently, not by how much you have.
 *
 * Everything here is pure and knows nothing about Tauri, so it can be tested
 * with `bun test` and reasoned about without a window open.
 */

export const META_FILE = "meta.json";
export const AREAS_FILE = "areas.json";
export const HABITS_FILE = "habits.json";
export const HABIT_LOGS_FILE = "habit-logs.json";
export const WEEKS_FILE = "weeks.json";
export const MONTHS_DIR = "months";

export interface MetaFile {
  version: number;
  nextTaskId: number;
  updatedAt: string;
}

export interface MonthNote {
  note: string;
  taskReferences: string[];
}

export interface MonthFile {
  tasks: DailyTask[];
  notes: Record<string, MonthNote>;
}

/** Everything read off disk, already parsed. */
export interface StoreContents {
  meta: MetaFile | null;
  areas: Area[];
  habits: Habit[];
  habitLogs: HabitLog[];
  weekly: Record<string, WeeklyEntry>;
  /** Keyed by `YYYY-MM`. */
  months: Record<string, MonthFile>;
}

/* ---------------------------------------------------------- serialisation -- */

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, sortKeys(source[key])]),
  );
}

/**
 * Stable stringify, byte-identical to what `momentum-data.mjs` writes.
 *
 * Keys are sorted so a file's diff only ever shows a real change, never the
 * order some object literal happened to be built in. Matching the CLI exactly
 * matters: if the two disagreed on formatting, running the CLI over a folder
 * the app wrote would rewrite every file and vice versa, and the git history
 * this layout exists to produce would be noise.
 */
export function serialise(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/* ------------------------------------------------------------- projection -- */

function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7) || "unknown";
}

/**
 * The month a task is filed under.
 *
 * Creation, not scheduling. A task's creation date never changes, so a past
 * month's file is immutable once the month is out; filing by scheduled date
 * would rewrite old files every time something was pushed to next week.
 */
function homeMonth(task: DailyTask, fallbackDate: string): string {
  return monthOf((task.createdAt ?? "").slice(0, 10) || fallbackDate);
}

/** The files a given `PlannerData` describes, as relative path to content. */
export function projectToFiles(data: PlannerData): Map<string, string> {
  const months = new Map<string, MonthFile>();
  const bucket = (month: string): MonthFile => {
    let entry = months.get(month);
    if (!entry) {
      entry = { tasks: [], notes: {} };
      months.set(month, entry);
    }
    return entry;
  };

  for (const [date, entry] of Object.entries(data.daily)) {
    for (const task of entry.tasks) {
      bucket(homeMonth(task, date)).tasks.push(task);
    }
    // An empty note on a day with nothing referenced is not worth a record.
    if (entry.note || entry.taskReferences.length > 0) {
      bucket(monthOf(date)).notes[date] = {
        note: entry.note,
        taskReferences: entry.taskReferences,
      };
    }
  }

  const files = new Map<string, string>();

  for (const [month, entry] of months) {
    // Sorted so the file content depends only on the data, never on the order
    // the daily map happened to iterate.
    entry.tasks.sort((a, b) => a.id.localeCompare(b.id));
    files.set(`${MONTHS_DIR}/${month}.json`, serialise(entry));
  }

  files.set(AREAS_FILE, serialise(data.areas));
  files.set(HABITS_FILE, serialise(data.habits));
  files.set(HABIT_LOGS_FILE, serialise(data.habitLogs));
  files.set(WEEKS_FILE, serialise(data.weekly));
  files.set(
    META_FILE,
    serialise({
      version: data.version,
      nextTaskId: data.nextTaskId,
      updatedAt: data.updatedAt,
    } satisfies MetaFile),
  );

  return files;
}

/* --------------------------------------------------------------- assembly -- */

/** Rebuilds `PlannerData` from the parsed contents of the folder. */
export function assemble(contents: StoreContents): PlannerData {
  const daily: Record<string, DailyEntry> = {};
  const ensure = (date: string): DailyEntry => {
    daily[date] ??= { date, tasks: [], note: "", taskReferences: [] };
    return daily[date];
  };

  // Month keys are sorted so task order within a day is stable across loads.
  for (const month of Object.keys(contents.months).sort()) {
    const file = contents.months[month];

    for (const task of file.tasks ?? []) {
      // Tasks live under their creation date, which is how the app keys its
      // daily map. The scheduled date is a property, not a location.
      const date = (task.createdAt ?? "").slice(0, 10);
      if (!date) {
        continue;
      }
      ensure(date).tasks.push(task);
    }

    for (const [date, note] of Object.entries(file.notes ?? {})) {
      const entry = ensure(date);
      entry.note = note.note ?? "";
      entry.taskReferences = note.taskReferences ?? [];
    }
  }

  // normalize backfills defaults and, importantly, rebuilds nextTaskId from the
  // tasks actually present, so a hand-edited or half-synced folder cannot mint
  // a duplicate ID.
  return normalizePlannerData({
    version: 2,
    daily,
    weekly: contents.weekly,
    habits: contents.habits,
    habitLogs: contents.habitLogs,
    areas: contents.areas,
    nextTaskId: contents.meta?.nextTaskId ?? 1,
    updatedAt: contents.meta?.updatedAt ?? new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ diff -- */

export interface FileChanges {
  /** Relative path to new content, for files that differ or are new. */
  write: Map<string, string>;
  /** Relative paths that no longer have any content behind them. */
  remove: string[];
}

/**
 * What actually has to touch the disk to get from `before` to `after`.
 *
 * The Dexie backend earns its keep by diffing rows before writing; this is the
 * same contract one level up. Without it every save would rewrite every month
 * file, which would make the folder useless in git and would put a synced
 * folder into a permanent state of churn.
 */
export function diffFiles(
  before: Map<string, string>,
  after: Map<string, string>,
): FileChanges {
  const write = new Map<string, string>();
  for (const [path, content] of after) {
    if (before.get(path) !== content) {
      write.set(path, content);
    }
  }

  const remove: string[] = [];
  for (const path of before.keys()) {
    if (!after.has(path)) {
      remove.push(path);
    }
  }

  return { write, remove };
}

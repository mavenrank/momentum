import Dexie, { type EntityTable } from "dexie";
import type {
  Area,
  DailyTask,
  Habit,
  HabitLog,
  WeeklyEntry,
} from "../../types/planner";

/** Single-row store holding counters and bookkeeping that aren't per-entity. */
export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Fields every synced record carries.
 *
 * `updatedAt` is what a merge compares to decide which side is newer, and
 * `deletedAt` is why a record can be removed without the other side resurrecting
 * it — a row that is simply missing is indistinguishable from one that never
 * arrived, so deletion has to be a fact you can replicate rather than an absence.
 */
export interface SyncFields {
  updatedAt: string;
  /** ISO timestamp when the record was removed; absent while it is live. */
  deletedAt?: string;
}

export type TaskRow = DailyTask & {
  /**
   * The date bucket the task is filed under — its creation date. Kept as a
   * column so a day's tasks can be fetched without scanning the table.
   */
  homeDate: string;
  deletedAt?: string;
};

/** A day's journal note. Split from its tasks so the two can change apart. */
export interface DailyNoteRow extends SyncFields {
  date: string;
  note: string;
  taskReferences: string[];
}

export type WeeklyRow = WeeklyEntry & SyncFields;
export type AreaRow = Area & SyncFields;
export type HabitRow = Habit & SyncFields;

export interface HabitLogRow extends HabitLog, SyncFields {
  /** `${habitId}::${date}` — the compound primary key. */
  id: string;
}

export class MomentumDatabase extends Dexie {
  tasks!: EntityTable<TaskRow, "id">;
  dailyNotes!: EntityTable<DailyNoteRow, "date">;
  weekly!: EntityTable<WeeklyRow, "weekStart">;
  habits!: EntityTable<HabitRow, "id">;
  habitLogs!: EntityTable<HabitLogRow, "id">;
  areas!: EntityTable<AreaRow, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor() {
    super("momentum");

    // Schema version 2 — the first IndexedDB schema. Tasks were nested inside
    // the daily entry that owned them. Declared so Dexie can upgrade from it.
    this.version(2).stores({
      daily: "date",
      weekly: "weekStart",
      habits: "id, archived",
      habitLogs: "id, habitId, date",
      areas: "id, name, archived",
      meta: "key",
    });

    // Schema version 3 — tasks become records in their own right.
    //
    // Under v2 the smallest thing that could be written or replicated was a
    // whole day's array of tasks, which meant two edits to two different tasks
    // that shared a creation date were a single conflicting change. Promoting
    // tasks to rows makes the unit of change the unit the user actually edits.
    //
    // The old `daily` store is NOT dropped here. Dexie applies schema changes
    // before it runs an upgrade function, so a store deleted in the same
    // version is already gone by the time the migration tries to read it — the
    // upgrade throws, the version never commits, and Dexie then refuses to open
    // the database at all. Deletion happens a version later, once the data has
    // safely landed.
    this.version(3)
      .stores({
        tasks: "id, homeDate, scheduledDate, status, area, updatedAt, deletedAt",
        dailyNotes: "date, updatedAt, deletedAt",
        weekly: "weekStart, updatedAt, deletedAt",
        habits: "id, archived, updatedAt, deletedAt",
        habitLogs: "id, habitId, date, updatedAt, deletedAt",
        areas: "id, name, archived, updatedAt, deletedAt",
        meta: "key",
      })
      .upgrade(async (transaction) => {
        const now = new Date().toISOString();
        const legacy = await transaction
          .table<LegacyDailyRow>("daily")
          .toArray();

        const tasks: TaskRow[] = [];
        const notes: DailyNoteRow[] = [];

        for (const entry of legacy) {
          const date = entry.date ?? "";
          for (const task of entry.tasks ?? []) {
            tasks.push({
              ...task,
              // Pre-v3 rows were filed by the day they were created, which is
              // the key they were stored under.
              homeDate: task.createdAt?.slice(0, 10) || date,
              updatedAt: task.updatedAt ?? now,
            });
          }

          notes.push({
            date,
            note: entry.note ?? "",
            taskReferences: entry.taskReferences ?? [],
            updatedAt: now,
          });
        }

        await transaction.table("tasks").bulkAdd(tasks);
        await transaction.table("dailyNotes").bulkAdd(notes);

        // Backfill the timestamp every merge will need. Everything present at
        // upgrade time is equally old, so they all get the same instant.
        for (const name of ["weekly", "habits", "habitLogs", "areas"]) {
          const table = transaction.table<Record<string, unknown>>(name);
          const rows = await table.toArray();
          await table.bulkPut(rows.map((row) => ({ ...row, updatedAt: now })));
        }
      });

    // Schema version 4 — retire the old store, now that v3 has copied it out.
    // Separating this from the migration is what keeps the migration readable
    // and, more importantly, re-runnable: if v3 fails the data is still there.
    this.version(4).stores({ daily: null });
  }
}

/** The v2 row shape, needed only by the upgrade above. */
interface LegacyDailyRow {
  date?: string;
  tasks?: DailyTask[];
  note?: string;
  taskReferences?: string[];
}

export const db = new MomentumDatabase();

export const META_KEYS = {
  version: "version",
  nextTaskId: "nextTaskId",
  updatedAt: "updatedAt",
  /** Short per-installation tag that keeps generated task IDs unique. */
  deviceTag: "deviceTag",
  /** Directory handle for folder backups, stored as a structured clone. */
  backupDirectory: "backupDirectory",
  backupWrittenAt: "backupWrittenAt",
} as const;

export function habitLogKey(habitId: string, date: string): string {
  return `${habitId}::${date}`;
}

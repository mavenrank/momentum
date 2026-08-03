import Dexie, { type EntityTable } from "dexie";
import type {
  Area,
  DailyEntry,
  Habit,
  HabitLog,
  WeeklyEntry,
} from "../../types/planner";

/** Single-row store holding counters and bookkeeping that aren't per-entity. */
export interface MetaRow {
  key: string;
  value: unknown;
}

export interface HabitLogRow extends HabitLog {
  /** `${habitId}::${date}` — the compound primary key. */
  id: string;
}

export class MomentumDatabase extends Dexie {
  daily!: EntityTable<DailyEntry, "date">;
  weekly!: EntityTable<WeeklyEntry, "weekStart">;
  habits!: EntityTable<Habit, "id">;
  habitLogs!: EntityTable<HabitLogRow, "id">;
  areas!: EntityTable<Area, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor() {
    super("momentum");

    // Schema version 2 — the first IndexedDB schema. v1 data lived in
    // localStorage and is imported by the repository on first launch.
    this.version(2).stores({
      daily: "date",
      weekly: "weekStart",
      habits: "id, archived",
      habitLogs: "id, habitId, date",
      areas: "id, name, archived",
      meta: "key",
    });
  }
}

export const db = new MomentumDatabase();

export const META_KEYS = {
  version: "version",
  nextTaskId: "nextTaskId",
  updatedAt: "updatedAt",
} as const;

export function habitLogKey(habitId: string, date: string): string {
  return `${habitId}::${date}`;
}

import { seedAreas } from "../areas";
import { generateTaskId } from "../taskId";
import type { DailyEntry, DailyTask, TaskPriority, TaskStatus } from "../../types/planner";

export interface Migration {
  from: number;
  to: number;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/* ------------------------------------------------------------- v1 shapes -- */

interface V1Task {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  category?: string;
}

interface V1DailyEntry {
  date?: string;
  tasks?: V1Task[];
  topFocus?: string;
  note?: string;
}

const STATUS_MAP: Record<string, TaskStatus> = {
  inbox: "pool",
  pool: "pool",
  open: "planned",
  planned: "planned",
  scheduled: "scheduled",
  inProgress: "doing",
  doing: "doing",
  waiting: "waiting",
  done: "done",
};

const PRIORITY_MAP: Record<string, TaskPriority> = {
  P1: "must",
  P2: "should",
  P3: "could",
  P4: "want",
  high: "must",
  medium: "could",
  low: "want",
  must: "must",
  should: "should",
  could: "could",
  want: "want",
};

export function mapStatus(value: string | undefined): TaskStatus {
  return (value && STATUS_MAP[value]) || "planned";
}

export function mapPriority(value: string | undefined): TaskPriority | undefined {
  return value ? PRIORITY_MAP[value] : undefined;
}

/* ------------------------------------------------------------- v1 → v2 -- */

function migrateV1ToV2(input: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const legacyDaily = (input.daily ?? {}) as Record<string, V1DailyEntry>;

  let counter = 1;
  const daily: Record<string, DailyEntry> = {};

  // Walk days in chronological order so the generated IDs sort the same way the
  // tasks were originally created.
  for (const dateKey of Object.keys(legacyDaily).sort()) {
    const entry = legacyDaily[dateKey] ?? {};
    const date = entry.date ?? dateKey;
    const tasks: DailyTask[] = (Array.isArray(entry.tasks) ? entry.tasks : []).map(
      (legacy) => {
        const status = mapStatus(legacy.status);
        const createdAt = `${date}T00:00:00.000Z`;

        return {
          id: generateTaskId(date, counter++),
          title: (legacy.title ?? "").trim(),
          status,
          priority: mapPriority(legacy.priority),
          // v1 had no area concept; `category` is dropped per the plan.
          scheduledDate: status === "pool" ? undefined : date,
          relationships: { dependsOn: [], blocks: [], related: [] },
          createdAt,
          updatedAt: now,
          completedAt: status === "done" ? now : undefined,
        } satisfies DailyTask;
      },
    );

    daily[dateKey] = {
      date,
      tasks,
      // `topFocus` is dropped; anything written there is folded into the note so
      // no user text is silently lost.
      note: [entry.topFocus?.trim(), entry.note ?? ""].filter(Boolean).join("\n\n"),
      taskReferences: [],
    };
  }

  const legacyWeekly = (input.weekly ?? {}) as Record<string, Record<string, unknown>>;
  const weekly = Object.fromEntries(
    Object.entries(legacyWeekly).map(([weekStart, entry]) => [
      weekStart,
      {
        weekStart: (entry.weekStart as string) ?? weekStart,
        notes: (entry.notes as string) ?? "",
      },
    ]),
  );

  return {
    version: 2,
    daily,
    weekly,
    habits: Array.isArray(input.habits) ? input.habits : [],
    habitLogs: Array.isArray(input.habitLogs) ? input.habitLogs : [],
    areas: seedAreas(() => crypto.randomUUID(), now),
    nextTaskId: counter,
    updatedAt: now,
  };
}

export const MIGRATIONS: Migration[] = [{ from: 1, to: 2, migrate: migrateV1ToV2 }];

export const CURRENT_VERSION = 2;

/** Runs every registered migration needed to bring `data` up to date. */
export function runMigrations(data: Record<string, unknown>): Record<string, unknown> {
  let current = data;
  let version = typeof current.version === "number" ? current.version : 1;

  while (version < CURRENT_VERSION) {
    const migration = MIGRATIONS.find((entry) => entry.from === version);
    if (!migration) {
      throw new Error(`No migration registered from schema version ${version}`);
    }
    current = migration.migrate(current);
    version = migration.to;
  }

  return current;
}

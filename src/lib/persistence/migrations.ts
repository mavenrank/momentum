import { seedAreas } from "../areas";
import { generateTaskId } from "../taskId";
import type { Area, DailyEntry, DailyTask, Domain, Pursuit, TaskPriority, TaskStatus } from "../../types/planner";

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

/* ------------------------------------------------------------- v3 → v4 -- */

function migrateV3ToV4(input: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const oldAreas = (Array.isArray(input.areas) ? input.areas : []) as Area[];
  const oldPursuits = (Array.isArray(input.pursuits) ? input.pursuits : []) as Array<Pursuit & { defaultAreaId?: string }>;
  const oldDaily = (input.daily ?? {}) as Record<string, DailyEntry>;
  const domains: Domain[] = [];
  const domain = (name: string, color: string): Domain => {
    let found = domains.find((entry) => entry.name === name);
    if (!found) {
      found = { id: crypto.randomUUID(), name, color, createdAt: now, archived: false };
      domains.push(found);
    }
    return found;
  };
  const work = domain("Work", "#a45c40");
  const personal = domain("Personal", "#8e6b8e");
  const areas: Area[] = oldAreas.map((area) => {
    const key = area.name.trim().toLowerCase();
    const parent = key === "work" ? work
      : ["personal", "health", "finance", "relationships"].includes(key) ? personal
      : key === "college" ? domain("Education", "#287c76")
      : domain("To organize", "#6b8f9e");
    return { ...area, name: ["work", "personal", "college"].includes(key) ? "General" : area.name, domainId: parent.id };
  });

  const areaForLegacyValue = (value: string | undefined): Area | undefined => {
    if (!value) return undefined;
    const found = areas.find((area) => area.id === value)
      ?? oldAreas.find((area) => area.name.trim().toLowerCase() === value.trim().toLowerCase());
    if (found) return areas.find((area) => area.id === found.id);
    const unplaced = domain("To organize", "#6b8f9e");
    const existing = areas.find((area) => area.domainId === unplaced.id && area.name.toLowerCase() === value.trim().toLowerCase());
    if (existing) return existing;
    const created: Area = { id: crypto.randomUUID(), name: value.trim(), domainId: unplaced.id,
      color: "#6b8f9e", createdAt: now, archived: false };
    areas.push(created);
    return created;
  };

  const daily: Record<string, DailyEntry> = Object.fromEntries(Object.entries(oldDaily).map(([date, entry]) => [
    date, { ...entry, tasks: (entry.tasks ?? []).map((task) => ({ ...task,
      area: areaForLegacyValue(task.area)?.id,
      relatedAreaIds: [],
    })) },
  ]));
  const tasks = Object.values(daily).flatMap((entry) => entry.tasks);
  let placement: Area | undefined;
  const placementArea = (): Area => {
    if (!placement) {
      placement = { id: crypto.randomUUID(), name: "Needs placement", domainId: domain("To organize", "#6b8f9e").id,
        color: "#6b8f9e", createdAt: now, archived: false };
      areas.push(placement);
    }
    return placement;
  };
  const pursuits = oldPursuits.map((pursuit) => {
    const members = tasks.filter((task) => task.pursuitId === pursuit.id);
    const memberAreas = [...new Set(members.map((task) => task.area).filter((id): id is string => Boolean(id)))];
    const home = areaForLegacyValue(pursuit.defaultAreaId)
      ?? (memberAreas.length === 1 ? areas.find((area) => area.id === memberAreas[0]) : undefined)
      ?? placementArea();
    for (const task of members) {
      if (!task.area) task.area = home.id;
    }
    const participatingAreaIds = memberAreas.filter((id) => id !== home.id);
    const { defaultAreaId: _legacy, ...rest } = pursuit;
    void _legacy;
    return { ...rest, homeAreaId: home.id, participatingAreaIds };
  });

  return { ...input, version: 4, domains, areas, pursuits, daily };
}

export const MIGRATIONS: Migration[] = [
  { from: 1, to: 2, migrate: migrateV1ToV2 },
  { from: 2, to: 3, migrate: (data) => ({ ...data, version: 3, pursuits: [] }) },
  { from: 3, to: 4, migrate: migrateV3ToV4 },
];

export const CURRENT_VERSION = 4;

/** Runs every registered migration needed to bring `data` up to date. */
export function runMigrations(data: Record<string, unknown>): Record<string, unknown> {
  let current = data;
  let version = typeof current.version === "number" ? current.version : 1;

  if (version > CURRENT_VERSION) {
    throw new Error(`Unsupported future schema version ${version}`);
  }

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

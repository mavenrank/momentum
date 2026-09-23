import { sortAreas } from "./areas";
import { seedDomains, seedOrganizedAreas } from "./organization";
import { toDateKey } from "./date";
import { generateTaskId, getDeviceTag, parseTaskIdCounter } from "./taskId";
import { CURRENT_VERSION, mapPriority, mapStatus, runMigrations } from "./persistence/migrations";
import type {
  Area,
  DailyEntry,
  DailyTask,
  PlannerData,
  WeeklyEntry,
} from "../types/planner";

export function createId(): string {
  return crypto.randomUUID();
}

export function createEmptyData(): PlannerData {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = toDateKey(now);
  const domains = seedDomains(createId, nowIso);

  return {
    version: 4,
    daily: {},
    weekly: {},
    habits: [
      {
        id: createId(),
        name: "Plan the day",
        color: "#287c76",
        createdAt: today,
        archived: false,
      },
      {
        id: createId(),
        name: "Journal",
        color: "#a45c40",
        createdAt: today,
        archived: false,
      },
    ],
    habitLogs: [],
    domains,
    areas: seedOrganizedAreas(createId, nowIso, domains),
    pursuits: [],
    nextTaskId: 1,
    updatedAt: nowIso,
  };
}

export function createDailyEntry(date: string): DailyEntry {
  return { date, tasks: [], note: "", taskReferences: [] };
}

export function createWeeklyEntry(weekStart: string): WeeklyEntry {
  return { weekStart, notes: "" };
}

export function ensureDaily(data: PlannerData, date: string): DailyEntry {
  return data.daily[date] ?? createDailyEntry(date);
}

export function ensureWeekly(data: PlannerData, weekStart: string): WeeklyEntry {
  return data.weekly[weekStart] ?? createWeeklyEntry(weekStart);
}

/* --------------------------------------------------------- normalization -- */

function normalizeTask(task: Partial<DailyTask> & { id: string }, fallbackDate: string): DailyTask {
  const now = new Date().toISOString();
  const status = mapStatus(task.status);

  return {
    id: task.id,
    title: (task.title ?? "").trim(),
    // Blank strings are normalized away so "has a description" stays a simple
    // truthiness check everywhere downstream.
    summary: task.summary?.trim() || undefined,
    description: task.description?.trim() || undefined,
    status,
    priority: mapPriority(task.priority),
    area: task.area || undefined,
    domainId: task.domainId || undefined,
    relatedAreaIds: Array.isArray(task.relatedAreaIds) ? [...new Set(task.relatedAreaIds)] : [],
    pursuitId: task.pursuitId || undefined,
    scheduledDate: task.scheduledDate || undefined,
    // A time and an all-day marker are mutually exclusive; the time wins.
    timeOfDay: task.timeOfDay || undefined,
    allDay: task.timeOfDay ? undefined : task.allDay || undefined,
    relationships: {
      dependsOn: task.relationships?.dependsOn ?? [],
      blocks: task.relationships?.blocks ?? [],
      related: task.relationships?.related ?? [],
      followUpOf: task.relationships?.followUpOf,
    },
    createdAt: task.createdAt ?? `${fallbackDate}T00:00:00.000Z`,
    updatedAt: task.updatedAt ?? now,
    completedAt: status === "done" ? (task.completedAt ?? now) : undefined,
  };
}

export function normalizePlannerData(input: PlannerData): PlannerData {
  const now = new Date().toISOString();

  const daily = Object.fromEntries(
    Object.entries(input.daily ?? {}).map(([date, entry]) => [
      date,
      {
        date: entry?.date ?? date,
        tasks: (Array.isArray(entry?.tasks) ? entry.tasks : [])
          .filter((task) => task && typeof task.id === "string")
          .map((task) => normalizeTask(task, date)),
        note: entry?.note ?? "",
        taskReferences: Array.isArray(entry?.taskReferences) ? entry.taskReferences : [],
      } satisfies DailyEntry,
    ]),
  );

  const weekly = Object.fromEntries(
    Object.entries(input.weekly ?? {}).map(([weekStart, entry]) => [
      weekStart,
      { weekStart: entry?.weekStart ?? weekStart, notes: entry?.notes ?? "" } satisfies WeeklyEntry,
    ]),
  );

  const domains = Array.isArray(input.domains) && input.domains.length > 0
    ? input.domains : seedDomains(createId, now);
  const areas: Area[] = sortAreas(
    Array.isArray(input.areas) && input.areas.length > 0
      ? input.areas
      : seedOrganizedAreas(createId, now, domains),
  );

  // Rebuild the counter from the data so an imported backup can never mint a
  // duplicate ID.
  const highestCounter = Object.values(daily)
    .flatMap((entry) => entry.tasks)
    .reduce((max, task) => Math.max(max, parseTaskIdCounter(task.id) ?? 0), 0);

  return {
    version: 4,
    daily,
    weekly,
    habits: Array.isArray(input.habits) ? input.habits : [],
    habitLogs: Array.isArray(input.habitLogs) ? input.habitLogs : [],
    domains,
    areas,
    pursuits: Array.isArray(input.pursuits) ? input.pursuits : [],
    nextTaskId: Math.max(input.nextTaskId ?? 1, highestCounter + 1),
    updatedAt: input.updatedAt ?? now,
  };
}

/* ------------------------------------------------------------- task reads -- */

export function allTasks(data: PlannerData): DailyTask[] {
  return Object.values(data.daily).flatMap((entry) => entry.tasks);
}

export function findTask(data: PlannerData, taskId: string): DailyTask | undefined {
  return allTasks(data).find((task) => task.id === taskId);
}

/** The daily entry key a task lives under — its creation date. */
export function taskHomeDate(task: DailyTask): string {
  return task.createdAt.slice(0, 10);
}

export function tasksScheduledOn(data: PlannerData, date: string): DailyTask[] {
  return allTasks(data).filter((task) => task.scheduledDate === date);
}

export function poolTasks(data: PlannerData): DailyTask[] {
  return allTasks(data).filter((task) => task.status === "pool");
}

export function unscheduledTasks(data: PlannerData): DailyTask[] {
  return allTasks(data).filter((task) => task.status === "planned" && !task.scheduledDate);
}

/* ------------------------------------------------------------ task writes -- */

export interface NewTaskInput {
  title: string;
  summary?: string;
  description?: string;
  status?: DailyTask["status"];
  priority?: DailyTask["priority"];
  area?: string;
  domainId?: string;
  relatedAreaIds?: string[];
  pursuitId?: string;
  scheduledDate?: string;
  timeOfDay?: string;
  allDay?: boolean;
  followUpOf?: string;
}

export interface AddTaskContext {
  /** Injectable clock for deterministic application and load tests. */
  now?: Date;
  /** Overrides the installation tag when another adapter owns identity. */
  deviceTag?: string;
}

/** Creates a task and files it under its creation date. Returns the new data. */
export function addTask(
  data: PlannerData,
  input: NewTaskInput,
  context: AddTaskContext = {},
): PlannerData {
  const now = context.now ?? new Date();
  const nowIso = now.toISOString();
  const homeDate = toDateKey(now);
  const id = generateTaskId(homeDate, data.nextTaskId, context.deviceTag ?? getDeviceTag());
  const status = input.status ?? (input.scheduledDate ? "scheduled" : "pool");

  const task: DailyTask = {
    id,
    title: input.title.trim(),
    summary: input.summary?.trim() || undefined,
    description: input.description?.trim() || undefined,
    status,
    priority: input.priority,
    area: input.area,
    domainId: input.domainId,
    relatedAreaIds: input.relatedAreaIds ?? [],
    pursuitId: input.pursuitId,
    scheduledDate: input.scheduledDate,
    timeOfDay: input.timeOfDay,
    allDay: input.timeOfDay ? undefined : input.allDay,
    relationships: {
      dependsOn: [],
      blocks: [],
      related: [],
      followUpOf: input.followUpOf,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: status === "done" ? nowIso : undefined,
  };

  const entry = ensureDaily(data, homeDate);

  return {
    ...data,
    daily: {
      ...data.daily,
      [homeDate]: { ...entry, tasks: [...entry.tasks, task] },
    },
    nextTaskId: data.nextTaskId + 1,
  };
}

export function addTasks(data: PlannerData, inputs: NewTaskInput[]): PlannerData {
  return inputs.reduce((current, input) => addTask(current, input), data);
}

/** Applies a patch to one task wherever it lives. */
export function updateTask(
  data: PlannerData,
  taskId: string,
  patch: Partial<Omit<DailyTask, "id" | "createdAt">>,
  now: Date = new Date(),
): PlannerData {
  const nowIso = now.toISOString();
  const daily = { ...data.daily };
  let touched = false;

  for (const [date, entry] of Object.entries(daily)) {
    if (!entry.tasks.some((task) => task.id === taskId)) {
      continue;
    }

    daily[date] = {
      ...entry,
      tasks: entry.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const next: DailyTask = { ...task, ...patch, updatedAt: nowIso };
        if (patch.status === "done" && task.status !== "done") {
          next.completedAt = nowIso;
        }
        if (patch.status && patch.status !== "done") {
          next.completedAt = undefined;
        }
        return next;
      }),
    };
    touched = true;
  }

  return touched ? { ...data, daily } : data;
}

export function deleteTask(data: PlannerData, taskId: string): PlannerData {
  const daily = Object.fromEntries(
    Object.entries(data.daily).map(([date, entry]) => [
      date,
      { ...entry, tasks: entry.tasks.filter((task) => task.id !== taskId) },
    ]),
  );

  // Drop dangling references so the relationship graph stays consistent.
  for (const [date, entry] of Object.entries(daily)) {
    daily[date] = {
      ...entry,
      tasks: entry.tasks.map((task) => ({
        ...task,
        relationships: {
          dependsOn: task.relationships.dependsOn.filter((id) => id !== taskId),
          blocks: task.relationships.blocks.filter((id) => id !== taskId),
          related: task.relationships.related.filter((id) => id !== taskId),
          followUpOf:
            task.relationships.followUpOf === taskId
              ? undefined
              : task.relationships.followUpOf,
        },
      })),
      taskReferences: entry.taskReferences.filter((id) => id !== taskId),
    };
  }

  return { ...data, daily };
}

/** Moves a task to a day (or clears the date, sending it back to Planned). */
export function scheduleTask(
  data: PlannerData,
  taskId: string,
  date: string | undefined,
  now: Date = new Date(),
): PlannerData {
  const task = findTask(data, taskId);
  if (!task) {
    return data;
  }

  if (!date) {
    return updateTask(data, taskId, {
      scheduledDate: undefined,
      status: task.status === "done" ? "done" : "planned",
    }, now);
  }

  return updateTask(data, taskId, {
    scheduledDate: date,
    status: task.status === "done" || task.status === "doing" ? task.status : "scheduled",
  }, now);
}

/**
 * Undoes a scheduling decision in one step: the date, the time and the all-day
 * marker all go, and the task drops back into the untriaged Pool. This is the
 * opposite of `scheduleTask`, which only ever clears the day.
 */
export function returnTaskToPool(
  data: PlannerData,
  taskId: string,
  now: Date = new Date(),
): PlannerData {
  return updateTask(data, taskId, {
    scheduledDate: undefined,
    timeOfDay: undefined,
    allDay: undefined,
    status: "pool",
  }, now);
}

export function toggleTaskDone(
  data: PlannerData,
  taskId: string,
  now: Date = new Date(),
): PlannerData {
  const task = findTask(data, taskId);
  if (!task) {
    return data;
  }

  if (task.status === "done") {
    return updateTask(data, taskId, {
      status: task.scheduledDate ? "scheduled" : "planned",
    }, now);
  }

  return updateTask(data, taskId, { status: "done" }, now);
}

/* ----------------------------------------------------------------- areas -- */

export function addArea(data: PlannerData, name: string, color: string, domainId: string): PlannerData {
  return {
    ...data,
    areas: [
      ...data.areas,
      { id: createId(), name: name.trim(), domainId, color, createdAt: new Date().toISOString(), archived: false },
    ],
  };
}

/* --------------------------------------------------------- import/export -- */

export function validateImport(value: unknown): PlannerData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const version = typeof candidate.version === "number" ? candidate.version : null;

  if (version === null || version > CURRENT_VERSION) {
    return null;
  }
  if (typeof candidate.daily !== "object" || typeof candidate.weekly !== "object") {
    return null;
  }

  try {
    const upgraded = version < CURRENT_VERSION ? runMigrations(candidate) : candidate;
    return normalizePlannerData({
      ...(upgraded as unknown as PlannerData),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

import type { DailyEntry, DailyTask, PlannerData, WeeklyEntry } from "../types/planner";
import { startOfWeekKey, toDateKey } from "./date";

const STORAGE_KEY = "momentum.planner.v1";

export function createId(): string {
  return crypto.randomUUID();
}

export function createEmptyData(): PlannerData {
  return {
    version: 1,
    daily: {},
    weekly: {},
    habits: [
      {
        id: createId(),
        name: "Plan the day",
        color: "#287c76",
        createdAt: toDateKey(new Date()),
        archived: false,
      },
      {
        id: createId(),
        name: "Journal",
        color: "#a45c40",
        createdAt: toDateKey(new Date()),
        archived: false,
      },
    ],
    habitLogs: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createDailyEntry(date: string): DailyEntry {
  return {
    date,
    tasks: [],
    topFocus: "",
    note: "",
  };
}

export function createWeeklyEntry(weekStart: string): WeeklyEntry {
  return {
    weekStart,
    topPriorities: [],
    lowPriorities: [],
    followUps: [],
    notes: "",
  };
}

function migrateTask(task: DailyTask): DailyTask {
  const legacy = task as Omit<DailyTask, "status" | "priority"> & {
    status?: string;
    priority?: string;
  };
  const priority =
    legacy.priority === "high"
      ? "P1"
      : legacy.priority === "medium"
        ? "P3"
        : legacy.priority === "low"
          ? "P4"
          : legacy.priority ?? "P3";
  const status =
    legacy.status === "open"
      ? "planned"
      : legacy.status === "inbox"
        ? "pool"
        : legacy.status === "done"
          ? "done"
          : legacy.status ?? "planned";

  return {
    ...task,
    priority: priority as DailyTask["priority"],
    status: status as DailyTask["status"],
  };
}

function migrateDailyEntry(entry: DailyEntry): DailyEntry {
  return {
    date: entry.date,
    tasks: Array.isArray(entry.tasks) ? entry.tasks.map(migrateTask) : [],
    topFocus: entry.topFocus ?? "",
    note: entry.note ?? "",
  };
}

function migrateWeeklyEntry(entry: WeeklyEntry): WeeklyEntry {
  const legacy = entry as WeeklyEntry & {
    theme?: string;
    focusAreas?: string[];
    commitments?: string[];
    reflection?: string;
  };

  return {
    weekStart: entry.weekStart,
    topPriorities: entry.topPriorities ?? legacy.focusAreas ?? [],
    lowPriorities: entry.lowPriorities ?? [],
    followUps: entry.followUps ?? [],
    notes: entry.notes ?? legacy.reflection ?? legacy.theme ?? "",
  };
}

function normalizePlannerData(data: PlannerData): PlannerData {
  return {
    ...data,
    daily: Object.fromEntries(
      Object.entries(data.daily ?? {}).map(([date, entry]) => [date, migrateDailyEntry(entry)]),
    ),
    weekly: Object.fromEntries(
      Object.entries(data.weekly ?? {}).map(([week, entry]) => [week, migrateWeeklyEntry(entry)]),
    ),
    habits: Array.isArray(data.habits) ? data.habits : [],
    habitLogs: Array.isArray(data.habitLogs) ? data.habitLogs : [],
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function loadPlannerData(): PlannerData {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return createEmptyData();
  }

  try {
    const parsed = JSON.parse(saved) as PlannerData;
    if (parsed.version !== 1) {
      return createEmptyData();
    }
    return normalizePlannerData(parsed);
  } catch {
    return createEmptyData();
  }
}

export function savePlannerData(data: PlannerData): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
  );
}

export function ensureDaily(data: PlannerData, date: string): DailyEntry {
  return data.daily[date] ?? createDailyEntry(date);
}

export function ensureWeekly(data: PlannerData, date: string): WeeklyEntry {
  const weekStart = startOfWeekKey(date);
  return data.weekly[weekStart] ?? createWeeklyEntry(weekStart);
}

export function validateImport(value: unknown): PlannerData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as PlannerData;
  if (
    candidate.version !== 1 ||
    typeof candidate.daily !== "object" ||
    typeof candidate.weekly !== "object" ||
    !Array.isArray(candidate.habits) ||
    !Array.isArray(candidate.habitLogs)
  ) {
    return null;
  }

  return normalizePlannerData({ ...candidate, updatedAt: new Date().toISOString() });
}

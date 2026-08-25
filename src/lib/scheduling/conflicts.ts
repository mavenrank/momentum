import { allTasks } from "../plannerData";
import { timeToMinutes } from "../date";
import type { DailyTask, PlannerData } from "../../types/planner";

export const DEFAULT_TASK_DURATION_MINUTES = 60;

export interface ScheduledInterval {
  date: string;
  start: number;
  end: number;
}

export interface TimeConflict {
  taskId: string;
  title: string;
  interval: ScheduledInterval;
}

export interface TimeConflictPair {
  first: Pick<DailyTask, "id" | "title">;
  second: Pick<DailyTask, "id" | "title">;
  interval: ScheduledInterval;
}

/** Strict ISO calendar-date validation without UTC/local-time conversion. */
export function isValidDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(year, month - 1, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

export interface TimeValueResult {
  valid: boolean;
  start?: number;
  end?: number;
  message?: string;
}

/**
 * Validates the persisted `HH:MM` / `HH:MM-HH:MM` representation. A single
 * clock time occupies the same nominal hour that the planner draws.
 */
export function validateTimeValue(
  value: string | undefined,
  defaultDuration = DEFAULT_TASK_DURATION_MINUTES,
): TimeValueResult {
  if (!value) {
    return { valid: true };
  }

  const parts = value.split("-");
  if (parts.length > 2) {
    return { valid: false, message: "Time must be HH:MM or HH:MM-HH:MM." };
  }

  const start = timeToMinutes(parts[0]);
  if (start === null) {
    return { valid: false, message: "Start time is not a valid 24-hour clock time." };
  }

  if (parts.length === 1) {
    return {
      valid: true,
      start,
      end: Math.min(24 * 60, start + defaultDuration),
    };
  }

  const end = timeToMinutes(parts[1]);
  if (end === null) {
    return { valid: false, message: "End time is not a valid 24-hour clock time." };
  }
  if (end <= start) {
    return {
      valid: false,
      message: "End time must be after start time; overnight blocks are not supported yet.",
    };
  }

  return { valid: true, start, end };
}

export function taskInterval(
  task: Pick<DailyTask, "scheduledDate" | "timeOfDay" | "allDay">,
): ScheduledInterval | null {
  if (!isValidDateKey(task.scheduledDate) || task.allDay || !task.timeOfDay) {
    return null;
  }

  const time = validateTimeValue(task.timeOfDay);
  if (!time.valid || time.start === undefined || time.end === undefined) {
    return null;
  }

  return { date: task.scheduledDate, start: time.start, end: time.end };
}

/** Half-open intervals make 10:00-11:00 adjacent to, not overlapping, 11:00-12:00. */
export function intervalsOverlap(a: ScheduledInterval, b: ScheduledInterval): boolean {
  return a.date === b.date && a.start < b.end && b.start < a.end;
}

export function findTimeConflicts(
  data: PlannerData,
  candidate: Pick<
    DailyTask,
    "id" | "scheduledDate" | "timeOfDay" | "allDay" | "status"
  >,
): TimeConflict[] {
  const interval = taskInterval(candidate);
  if (!interval || candidate.status === "done") {
    return [];
  }

  return allTasks(data)
    .filter((task) => task.id !== candidate.id && task.status !== "done")
    .flatMap((task) => {
      const existing = taskInterval(task);
      return existing && intervalsOverlap(interval, existing)
        ? [{ taskId: task.id, title: task.title, interval: existing }]
        : [];
    });
}

/**
 * Finds every active overlap with a per-day sweep instead of comparing every
 * task to the entire store. Runtime is O(n log n + k), where k is the number
 * of actual conflicting pairs that must be reported.
 */
export function findAllTimeConflictPairs(data: PlannerData): TimeConflictPair[] {
  const byDate = new Map<
    string,
    Array<{ task: DailyTask; interval: ScheduledInterval }>
  >();

  for (const task of allTasks(data)) {
    if (task.status === "done") continue;
    const interval = taskInterval(task);
    if (!interval) continue;
    const scheduled = byDate.get(interval.date) ?? [];
    scheduled.push({ task, interval });
    byDate.set(interval.date, scheduled);
  }

  const pairs: TimeConflictPair[] = [];
  for (const scheduled of byDate.values()) {
    scheduled.sort(
      (a, b) => a.interval.start - b.interval.start || a.interval.end - b.interval.end,
    );
    let active: typeof scheduled = [];

    for (const current of scheduled) {
      active = active.filter((entry) => entry.interval.end > current.interval.start);
      for (const existing of active) {
        pairs.push({
          first: { id: existing.task.id, title: existing.task.title },
          second: { id: current.task.id, title: current.task.title },
          interval: current.interval,
        });
      }
      active.push(current);
    }
  }

  return pairs;
}

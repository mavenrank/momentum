export type ViewMode =
  | "planner"
  | "tasks"
  | "calendar"
  | "habits"
  | "pursuits"
  | "settings";
/** The Planner workspace holds the two execution lenses; Calendar is top-level. */
export type PlannerLens = "today" | "week";

export type TaskStatus = "pool" | "planned" | "scheduled" | "doing" | "waiting" | "done";
export type TaskPriority = "must" | "should" | "could" | "want";

/** Stable area ID, looked up in the Areas store. */
export type TaskArea = string;

/** Broad context. Tasks with no Area may still belong directly to a Domain. */
export interface Domain {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  archived: boolean;
}

export interface TaskRelationships {
  dependsOn: string[];
  blocks: string[];
  related: string[];
  followUpOf?: string;
}

export interface DailyTask {
  /** "T-20260714-0001" — immutable for the life of the task. */
  id: string;
  /** ~120 char soft limit, single line. */
  title: string;
  /**
   * Short one-line description (~200 chars). Cheap enough to render inline on
   * cards and in list rows.
   */
  summary?: string;
  /**
   * Long-form multi-line body. Most tasks never carry one, so the field is
   * absent rather than empty; the few that do need room for real notes.
   */
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  area?: TaskArea;
  /** Set only when the task is filed directly in a Domain, without an Area. */
  domainId?: string;
  /** Secondary connections; these do not change the task's primary home. */
  relatedAreaIds?: string[];
  pursuitId?: string;
  /** ISO date "YYYY-MM-DD". */
  scheduledDate?: string;
  /** "15:00" or "14:00-16:00". Present only on timed tasks. */
  timeOfDay?: string;
  /**
   * Marks a task as occupying the whole day rather than a moment in it — a
   * deadline, a trip, an on-call shift. All-day tasks sort above timed ones and
   * never carry a `timeOfDay`.
   */
  allDay?: boolean;
  relationships: TaskRelationships;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface DailyEntry {
  date: string;
  /** Tasks created or scheduled on this day. */
  tasks: DailyTask[];
  note: string;
  /** Task IDs referenced via @-mentions in the journal note. */
  taskReferences: string[];
}

export interface WeeklyEntry {
  weekStart: string;
  notes: string;
}

export interface Area {
  id: string;
  name: string;
  domainId: string;
  color: string;
  createdAt: string;
  archived: boolean;
}

export type PursuitStatus = "active" | "on_hold" | "completed" | "archived";

export interface Pursuit {
  id: string;
  name: string;
  homeAreaId: string;
  participatingAreaIds: string[];
  status: PursuitStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  archived: boolean;
}

export interface HabitLog {
  habitId: string;
  date: string;
  done: boolean;
}

export interface PlannerData {
  version: 4;
  daily: Record<string, DailyEntry>;
  weekly: Record<string, WeeklyEntry>;
  habits: Habit[];
  habitLogs: HabitLog[];
  domains: Domain[];
  areas: Area[];
  pursuits: Pursuit[];
  /** Global counter behind the T-YYYYMMDD-NNNN task IDs. */
  nextTaskId: number;
  updatedAt: string;
}

export const TASK_STATUSES: TaskStatus[] = [
  "pool",
  "planned",
  "scheduled",
  "doing",
  "waiting",
  "done",
];

export const TASK_PRIORITIES: TaskPriority[] = ["must", "should", "could", "want"];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  must: "Must",
  should: "Should",
  could: "Could",
  want: "Want",
};

/** How a scheduled task relates to the clock. */
export type TaskTiming = "timed" | "allDay" | "anytime";

export function taskTiming(task: Pick<DailyTask, "timeOfDay" | "allDay">): TaskTiming {
  if (task.timeOfDay) {
    return "timed";
  }
  return task.allDay ? "allDay" : "anytime";
}

/**
 * Orders a day's tasks the way it is actually read: all-day commitments first,
 * then timed work in clock order, then anything without a time.
 */
export function compareByTiming(a: DailyTask, b: DailyTask): number {
  const rank = (task: DailyTask) => {
    const timing = taskTiming(task);
    return timing === "allDay" ? 0 : timing === "timed" ? 1 : 2;
  };

  const delta = rank(a) - rank(b);
  if (delta !== 0) {
    return delta;
  }
  return (a.timeOfDay ?? "").localeCompare(b.timeOfDay ?? "");
}

/** Soft limits enforced by the editors, not by the data layer. */
export const TITLE_SOFT_LIMIT = 120;
export const SUMMARY_SOFT_LIMIT = 200;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pool: "Pool",
  planned: "Planned",
  scheduled: "Scheduled",
  doing: "Doing",
  waiting: "Waiting",
  done: "Done",
};

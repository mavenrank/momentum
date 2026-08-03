export type ViewMode = "daily" | "weekly" | "monthly" | "habits" | "journal" | "data";

export type TaskStatus = "pool" | "planned" | "inProgress" | "waiting" | "done";
export type TaskPriority = "P1" | "P2" | "P3" | "P4";
export type TaskCategory = "top" | "todo" | "low" | "followUp";

export interface DailyTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  category?: TaskCategory;
}

export interface DailyEntry {
  date: string;
  tasks: DailyTask[];
  topFocus: string;
  note: string;
}

export interface WeeklyEntry {
  weekStart: string;
  topPriorities: string[];
  lowPriorities: string[];
  followUps: string[];
  notes: string;
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
  version: 1;
  daily: Record<string, DailyEntry>;
  weekly: Record<string, WeeklyEntry>;
  habits: Habit[];
  habitLogs: HabitLog[];
  updatedAt: string;
}

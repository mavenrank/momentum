import { toDateKey } from "./date";

/**
 * Builds an immutable task ID of the form `T-YYYYMMDD-NNNN`.
 *
 * The date prefix records when the task was created; `NNNN` is a global counter
 * that keeps climbing across every task ever created, not per date.
 */
export function generateTaskId(date: Date | string, counter: number): string {
  const dateKey = typeof date === "string" ? date : toDateKey(date);
  const compact = dateKey.replace(/-/g, "");
  return `T-${compact}-${String(counter).padStart(4, "0")}`;
}

const TASK_ID_PATTERN = /^T-(\d{8})-(\d{4,})$/;

export function isTaskId(value: string): boolean {
  return TASK_ID_PATTERN.test(value);
}

/** Reads the counter back out of an ID, used when rebuilding `nextTaskId`. */
export function parseTaskIdCounter(id: string): number | null {
  const match = TASK_ID_PATTERN.exec(id);
  return match ? Number(match[2]) : null;
}

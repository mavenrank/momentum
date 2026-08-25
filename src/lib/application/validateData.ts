import { findArea } from "../areas";
import { fromDateKey } from "../date";
import { allTasks } from "../plannerData";
import {
  findAllTimeConflictPairs,
  isValidDateKey,
  validateTimeValue,
} from "../scheduling/conflicts";
import { isTaskId, parseTaskIdCounter } from "../taskId";
import type { PlannerData } from "../../types/planner";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  entityId?: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
}

export function validatePlannerData(data: PlannerData): ValidationReport {
  const issues: ValidationIssue[] = [];
  const taskIds = new Set<string>();
  const tasks = allTasks(data);
  const areaNames = new Set<string>();
  let highestCounter = 0;

  const issue = (
    severity: ValidationSeverity,
    code: string,
    message: string,
    entityId?: string,
  ) => issues.push({ severity, code, message, entityId });

  for (const area of data.areas) {
    const key = area.name.trim().toLowerCase();
    if (!key) {
      issue("error", "EMPTY_AREA_NAME", "An area has an empty name.", area.id);
    } else if (areaNames.has(key)) {
      issue("error", "DUPLICATE_AREA_NAME", `Duplicate area name: ${area.name}.`, area.id);
    }
    areaNames.add(key);
  }

  for (const [date, entry] of Object.entries(data.daily)) {
    if (!isValidDateKey(date)) {
      issue("error", "INVALID_DAILY_DATE", `Invalid daily-entry key: ${date}.`, date);
    }
    if (entry.date !== date) {
      issue(
        "error",
        "DAILY_DATE_MISMATCH",
        `Daily entry ${date} stores a different date: ${entry.date}.`,
        date,
      );
    }

    for (const task of entry.tasks) {
      if (taskIds.has(task.id)) {
        issue("error", "DUPLICATE_TASK_ID", `Duplicate task ID: ${task.id}.`, task.id);
      }
      taskIds.add(task.id);

      if (!isTaskId(task.id)) {
        issue("error", "INVALID_TASK_ID", `Invalid task ID: ${task.id}.`, task.id);
      }
      highestCounter = Math.max(highestCounter, parseTaskIdCounter(task.id) ?? 0);
      if (!task.title.trim()) {
        issue("error", "EMPTY_TASK_TITLE", "Task title cannot be empty.", task.id);
      }
      if (task.scheduledDate && !isValidDateKey(task.scheduledDate)) {
        issue(
          "error",
          "INVALID_SCHEDULED_DATE",
          `Invalid scheduled date: ${task.scheduledDate}.`,
          task.id,
        );
      }
      const time = validateTimeValue(task.timeOfDay);
      if (!time.valid) {
        issue("error", "INVALID_TASK_TIME", time.message ?? "Invalid task time.", task.id);
      }
      if (task.timeOfDay && task.allDay) {
        issue(
          "error",
          "MUTUALLY_EXCLUSIVE_TIMING",
          "Task is both all-day and assigned a clock time.",
          task.id,
        );
      }
      if (task.area && !findArea(data.areas, task.area)) {
        issue("error", "UNKNOWN_TASK_AREA", `Task uses unknown area: ${task.area}.`, task.id);
      }
      if (task.status === "pool" && task.scheduledDate) {
        issue("warning", "DATED_POOL_TASK", "Pool task still has a scheduled date.", task.id);
      }
    }

    for (const reference of entry.taskReferences) {
      if (!taskIds.has(reference) && !tasks.some((task) => task.id === reference)) {
        issue(
          "warning",
          "DANGLING_JOURNAL_REFERENCE",
          `Journal entry ${date} references missing task ${reference}.`,
          date,
        );
      }
    }
  }

  if (!Number.isSafeInteger(data.nextTaskId) || data.nextTaskId < 1) {
    issue(
      "error",
      "INVALID_TASK_COUNTER",
      `nextTaskId must be a positive safe integer; received ${String(data.nextTaskId)}.`,
    );
  } else if (data.nextTaskId <= highestCounter) {
    issue(
      "error",
      "STALE_TASK_COUNTER",
      `nextTaskId ${data.nextTaskId} must be greater than existing counter ${highestCounter}.`,
    );
  }

  const habitIds = new Set<string>();
  const habitNames = new Set<string>();
  for (const habit of data.habits) {
    if (habitIds.has(habit.id)) {
      issue("error", "DUPLICATE_HABIT_ID", `Duplicate habit ID: ${habit.id}.`, habit.id);
    }
    habitIds.add(habit.id);
    const name = habit.name.trim().toLowerCase();
    if (habitNames.has(name)) {
      issue("error", "DUPLICATE_HABIT_NAME", `Duplicate habit name: ${habit.name}.`, habit.id);
    }
    habitNames.add(name);
  }

  const logKeys = new Set<string>();
  for (const log of data.habitLogs) {
    const key = `${log.habitId}::${log.date}`;
    if (logKeys.has(key)) {
      issue("error", "DUPLICATE_HABIT_LOG", `Duplicate habit log: ${key}.`, key);
    }
    logKeys.add(key);
    if (!habitIds.has(log.habitId)) {
      issue("error", "ORPHAN_HABIT_LOG", `Habit log references missing habit.`, key);
    }
    if (!isValidDateKey(log.date)) {
      issue("error", "INVALID_HABIT_DATE", `Invalid habit-log date: ${log.date}.`, key);
    }
  }

  for (const [weekStart, entry] of Object.entries(data.weekly)) {
    if (!isValidDateKey(weekStart) || entry.weekStart !== weekStart) {
      issue("error", "INVALID_WEEK", `Invalid weekly entry: ${weekStart}.`, weekStart);
      continue;
    }
    if (fromDateKey(weekStart).getDay() !== 1) {
      issue("warning", "WEEK_NOT_MONDAY", `Weekly entry does not start on Monday.`, weekStart);
    }
  }

  for (const conflict of findAllTimeConflictPairs(data)) {
    issue(
      "warning",
      "TIME_CONFLICT",
      `“${conflict.first.title}” overlaps “${conflict.second.title}” on ${conflict.interval.date}.`,
      conflict.first.id,
    );
  }

  const errors = issues.filter((entry) => entry.severity === "error").length;
  const warnings = issues.length - errors;
  return { valid: errors === 0, errors, warnings, issues };
}

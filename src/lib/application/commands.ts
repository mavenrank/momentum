import { DEFAULT_AREA_SEEDS, findArea, nextCustomAreaColor } from "../areas";
import { addDays, toDateKey } from "../date";
import { extractTaskReferences } from "../journal";
import {
  addTask,
  createDailyEntry,
  createId,
  deleteTask,
  findTask,
  returnTaskToPool,
  scheduleTask,
  toggleTaskDone,
  updateTask,
} from "../plannerData";
import {
  findTimeConflicts,
  isValidDateKey,
  validateTimeValue,
  type TimeConflict,
} from "../scheduling/conflicts";
import type {
  Area,
  DailyTask,
  Habit,
  PlannerData,
  TaskStatus,
} from "../../types/planner";
import type { NewTaskInput } from "../plannerData";

export type ConflictPolicy = "allow" | "warn" | "reject";

export interface CommandWarning {
  code: "TIME_CONFLICT";
  message: string;
  conflictingTaskIds: string[];
}

export type CommandErrorCode =
  | "AREA_EXISTS"
  | "AREA_NOT_FOUND"
  | "HABIT_EXISTS"
  | "HABIT_NOT_FOUND"
  | "INVALID_DATE"
  | "INVALID_NAME"
  | "INVALID_TASK"
  | "INVALID_TIME"
  | "TASK_NOT_FOUND"
  | "TIME_CONFLICT";

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  conflictingTaskIds?: string[];
}

export type TaskPatch = Partial<Omit<DailyTask, "id" | "createdAt">>;

export type PlannerCommand =
  | { type: "task.create"; input: NewTaskInput; conflictPolicy?: ConflictPolicy }
  | { type: "task.update"; taskId: string; patch: TaskPatch; conflictPolicy?: ConflictPolicy }
  | { type: "task.delete"; taskId: string }
  | { type: "task.toggleDone"; taskId: string }
  | { type: "task.schedule"; taskId: string; date?: string; conflictPolicy?: ConflictPolicy }
  | { type: "task.returnToPool"; taskId: string }
  | {
      type: "task.createFollowUp";
      parentId: string;
      title: string;
      scheduledDate?: string;
      conflictPolicy?: ConflictPolicy;
    }
  | { type: "journal.set"; date: string; note: string }
  | { type: "weekly.set"; weekStart: string; notes: string }
  | { type: "area.create"; name: string; color?: string }
  | { type: "area.update"; areaId: string; patch: Partial<Pick<Area, "name" | "color" | "archived">> }
  | { type: "area.restoreDefaults" }
  | { type: "habit.create"; name: string; color?: string; createdDate?: string }
  | { type: "habit.archive"; habitId: string; archived?: boolean }
  | { type: "habit.toggle"; habitId: string; date: string }
  | { type: "maintenance.collectStale"; today?: string };

export interface CommandContext {
  now?: Date;
  deviceTag?: string;
  createEntityId?: () => string;
  defaultConflictPolicy?: ConflictPolicy;
}

export interface CommandSuccess {
  ok: true;
  data: PlannerData;
  value?: unknown;
  warnings: CommandWarning[];
}

export interface CommandFailure {
  ok: false;
  data: PlannerData;
  error: CommandError;
  warnings: CommandWarning[];
}

export type PlannerCommandResult = CommandSuccess | CommandFailure;
export type PlannerCommandExecutor = (
  command: PlannerCommand,
  context?: CommandContext,
) => PlannerCommandResult;

const HABIT_COLORS = ["#287c76", "#a45c40", "#5b6c91", "#8a6f3d", "#6b705c"];

function success(
  data: PlannerData,
  value?: unknown,
  warnings: CommandWarning[] = [],
): CommandSuccess {
  return { ok: true, data, value, warnings };
}

function failure(data: PlannerData, code: CommandErrorCode, message: string): CommandFailure {
  return { ok: false, data, error: { code, message }, warnings: [] };
}

function touch(data: PlannerData, now: Date): PlannerData {
  return { ...data, updatedAt: now.toISOString() };
}

function validateTaskShape(
  data: PlannerData,
  task: Pick<DailyTask, "title" | "scheduledDate" | "timeOfDay" | "allDay" | "area">,
): CommandError | null {
  if (!task.title.trim()) {
    return { code: "INVALID_TASK", message: "Task title cannot be empty." };
  }
  if (task.scheduledDate && !isValidDateKey(task.scheduledDate)) {
    return { code: "INVALID_DATE", message: `Invalid scheduled date: ${task.scheduledDate}.` };
  }
  if (task.timeOfDay && task.allDay) {
    return {
      code: "INVALID_TIME",
      message: "A task cannot be both all-day and assigned a clock time.",
    };
  }
  const time = validateTimeValue(task.timeOfDay);
  if (!time.valid) {
    return { code: "INVALID_TIME", message: time.message ?? "Invalid task time." };
  }
  if (task.area && !findArea(data.areas, task.area)) {
    return { code: "AREA_NOT_FOUND", message: `Unknown area: ${task.area}.` };
  }
  return null;
}

function conflictResult(
  original: PlannerData,
  next: PlannerData,
  candidate: DailyTask,
  policy: ConflictPolicy,
): PlannerCommandResult | null {
  const conflicts = findTimeConflicts(next, candidate);
  if (conflicts.length === 0 || policy === "allow") {
    return null;
  }

  const ids = conflicts.map((conflict) => conflict.taskId);
  const message = conflictMessage(conflicts);
  if (policy === "reject") {
    return {
      ok: false,
      data: original,
      error: { code: "TIME_CONFLICT", message, conflictingTaskIds: ids },
      warnings: [],
    };
  }

  return success(next, candidate, [
    { code: "TIME_CONFLICT", message, conflictingTaskIds: ids },
  ]);
}

function conflictMessage(conflicts: TimeConflict[]): string {
  const names = conflicts.slice(0, 3).map((conflict) => `“${conflict.title}”`);
  const remainder = conflicts.length - names.length;
  return `Schedule overlaps ${names.join(", ")}${remainder > 0 ? ` and ${remainder} more` : ""}.`;
}

function commandConflictPolicy(command: PlannerCommand, context: CommandContext): ConflictPolicy {
  if (
    command.type === "task.create" ||
    command.type === "task.update" ||
    command.type === "task.schedule" ||
    command.type === "task.createFollowUp"
  ) {
    return command.conflictPolicy ?? context.defaultConflictPolicy ?? "warn";
  }
  return context.defaultConflictPolicy ?? "warn";
}

function ensureInputArea(
  data: PlannerData,
  areaName: string | undefined,
  now: Date,
  makeId: () => string,
): PlannerData {
  if (!areaName || findArea(data.areas, areaName)) {
    return data;
  }

  return {
    ...data,
    areas: [
      ...data.areas,
      {
        id: makeId(),
        name: areaName.trim(),
        color: nextCustomAreaColor(data.areas.length),
        createdAt: now.toISOString(),
        archived: false,
      },
    ],
  };
}

export function executePlannerCommand(
  data: PlannerData,
  command: PlannerCommand,
  context: CommandContext = {},
): PlannerCommandResult {
  const now = context.now ?? new Date();
  const makeId = context.createEntityId ?? createId;
  const policy = commandConflictPolicy(command, context);

  switch (command.type) {
    case "task.create": {
      const input = { ...command.input, title: command.input.title.trim() };
      let base = ensureInputArea(data, input.area, now, makeId);
      const canonicalArea = input.area ? findArea(base.areas, input.area)?.name : undefined;
      const shapeError = validateTaskShape(base, { ...input, area: canonicalArea });
      if (shapeError) {
        return { ok: false, data, error: shapeError, warnings: [] };
      }

      const existingIds = new Set(
        Object.values(base.daily).flatMap((entry) => entry.tasks.map((task) => task.id)),
      );
      base = addTask(base, { ...input, area: canonicalArea }, { now, deviceTag: context.deviceTag });
      const created = Object.values(base.daily)
        .flatMap((entry) => entry.tasks)
        .find((task) => !existingIds.has(task.id));
      if (!created) {
        return failure(data, "INVALID_TASK", "Task could not be created.");
      }

      const conflict = conflictResult(data, base, created, policy);
      return conflict ?? success(touch(base, now), created);
    }

    case "task.update": {
      const existing = findTask(data, command.taskId);
      if (!existing) {
        return failure(data, "TASK_NOT_FOUND", `Task not found: ${command.taskId}.`);
      }
      const candidate: DailyTask = { ...existing, ...command.patch };
      const shapeError = validateTaskShape(data, candidate);
      if (shapeError) {
        return { ok: false, data, error: shapeError, warnings: [] };
      }
      const next = updateTask(data, command.taskId, command.patch, now);
      const updated = findTask(next, command.taskId)!;
      const conflict = conflictResult(data, next, updated, policy);
      return conflict ?? success(touch(next, now), updated);
    }

    case "task.delete": {
      if (!findTask(data, command.taskId)) {
        return failure(data, "TASK_NOT_FOUND", `Task not found: ${command.taskId}.`);
      }
      return success(touch(deleteTask(data, command.taskId), now), { taskId: command.taskId });
    }

    case "task.toggleDone": {
      if (!findTask(data, command.taskId)) {
        return failure(data, "TASK_NOT_FOUND", `Task not found: ${command.taskId}.`);
      }
      const next = toggleTaskDone(data, command.taskId, now);
      return success(touch(next, now), findTask(next, command.taskId));
    }

    case "task.schedule": {
      if (!findTask(data, command.taskId)) {
        return failure(data, "TASK_NOT_FOUND", `Task not found: ${command.taskId}.`);
      }
      if (command.date && !isValidDateKey(command.date)) {
        return failure(data, "INVALID_DATE", `Invalid scheduled date: ${command.date}.`);
      }
      const next = scheduleTask(data, command.taskId, command.date, now);
      const updated = findTask(next, command.taskId)!;
      const shapeError = validateTaskShape(next, updated);
      if (shapeError) {
        return { ok: false, data, error: shapeError, warnings: [] };
      }
      const conflict = conflictResult(data, next, updated, policy);
      return conflict ?? success(touch(next, now), updated);
    }

    case "task.returnToPool": {
      if (!findTask(data, command.taskId)) {
        return failure(data, "TASK_NOT_FOUND", `Task not found: ${command.taskId}.`);
      }
      const next = returnTaskToPool(data, command.taskId, now);
      return success(touch(next, now), findTask(next, command.taskId));
    }

    case "task.createFollowUp": {
      if (!findTask(data, command.parentId)) {
        return failure(data, "TASK_NOT_FOUND", `Parent task not found: ${command.parentId}.`);
      }
      return executePlannerCommand(
        data,
        {
          type: "task.create",
          input: {
            title: command.title,
            scheduledDate: command.scheduledDate,
            status: command.scheduledDate ? "scheduled" : "pool",
            followUpOf: command.parentId,
          },
          conflictPolicy: command.conflictPolicy,
        },
        context,
      );
    }

    case "journal.set": {
      if (!isValidDateKey(command.date)) {
        return failure(data, "INVALID_DATE", `Invalid journal date: ${command.date}.`);
      }
      const entry = data.daily[command.date] ?? createDailyEntry(command.date);
      const next = {
        ...data,
        daily: {
          ...data.daily,
          [command.date]: {
            ...entry,
            note: command.note,
            taskReferences: extractTaskReferences(command.note),
          },
        },
      };
      return success(touch(next, now), next.daily[command.date]);
    }

    case "weekly.set": {
      if (!isValidDateKey(command.weekStart)) {
        return failure(data, "INVALID_DATE", `Invalid week start: ${command.weekStart}.`);
      }
      const next = {
        ...data,
        weekly: {
          ...data.weekly,
          [command.weekStart]: { weekStart: command.weekStart, notes: command.notes },
        },
      };
      return success(touch(next, now), next.weekly[command.weekStart]);
    }

    case "area.create": {
      const name = command.name.trim();
      if (!name) {
        return failure(data, "INVALID_NAME", "Area name cannot be empty.");
      }
      if (findArea(data.areas, name)) {
        return failure(data, "AREA_EXISTS", `Area already exists: ${name}.`);
      }
      const area: Area = {
        id: makeId(),
        name,
        color: command.color ?? nextCustomAreaColor(data.areas.length),
        createdAt: now.toISOString(),
        archived: false,
      };
      return success(touch({ ...data, areas: [...data.areas, area] }, now), area);
    }

    case "area.update": {
      const area = data.areas.find((entry) => entry.id === command.areaId);
      if (!area) {
        return failure(data, "AREA_NOT_FOUND", `Area not found: ${command.areaId}.`);
      }
      const name = command.patch.name?.trim();
      if (command.patch.name !== undefined && !name) {
        return failure(data, "INVALID_NAME", "Area name cannot be empty.");
      }
      const duplicate = name
        ? data.areas.find(
            (entry) => entry.id !== area.id && entry.name.toLowerCase() === name.toLowerCase(),
          )
        : undefined;
      if (duplicate) {
        return failure(data, "AREA_EXISTS", `Area already exists: ${name}.`);
      }

      const nextName = name ?? area.name;
      const daily = Object.fromEntries(
        Object.entries(data.daily).map(([date, entry]) => [
          date,
          {
            ...entry,
            tasks: entry.tasks.map((task) =>
              task.area?.toLowerCase() === area.name.toLowerCase()
                ? { ...task, area: nextName, updatedAt: now.toISOString() }
                : task,
            ),
          },
        ]),
      );
      const nextArea = { ...area, ...command.patch, name: nextName };
      const next = {
        ...data,
        daily,
        areas: data.areas.map((entry) => (entry.id === area.id ? nextArea : entry)),
      };
      return success(touch(next, now), nextArea);
    }

    case "area.restoreDefaults": {
      const additions = DEFAULT_AREA_SEEDS.filter((seed) => !findArea(data.areas, seed.name)).map(
        (seed) => ({
          id: makeId(),
          name: seed.name,
          color: seed.color,
          createdAt: now.toISOString(),
          archived: false,
        }),
      );
      return success(touch({ ...data, areas: [...data.areas, ...additions] }, now), additions);
    }

    case "habit.create": {
      const name = command.name.trim();
      if (!name) {
        return failure(data, "INVALID_NAME", "Habit name cannot be empty.");
      }
      if (data.habits.some((habit) => habit.name.toLowerCase() === name.toLowerCase())) {
        return failure(data, "HABIT_EXISTS", `Habit already exists: ${name}.`);
      }
      const createdDate = command.createdDate ?? toDateKey(now);
      if (!isValidDateKey(createdDate)) {
        return failure(data, "INVALID_DATE", `Invalid habit creation date: ${createdDate}.`);
      }
      const habit: Habit = {
        id: makeId(),
        name,
        color: command.color ?? HABIT_COLORS[data.habits.length % HABIT_COLORS.length],
        createdAt: createdDate,
        archived: false,
      };
      return success(touch({ ...data, habits: [...data.habits, habit] }, now), habit);
    }

    case "habit.archive": {
      const habit = data.habits.find((entry) => entry.id === command.habitId);
      if (!habit) {
        return failure(data, "HABIT_NOT_FOUND", `Habit not found: ${command.habitId}.`);
      }
      const archived = command.archived ?? true;
      const nextHabit = { ...habit, archived };
      return success(
        touch(
          {
            ...data,
            habits: data.habits.map((entry) => (entry.id === habit.id ? nextHabit : entry)),
          },
          now,
        ),
        nextHabit,
      );
    }

    case "habit.toggle": {
      if (!isValidDateKey(command.date)) {
        return failure(data, "INVALID_DATE", `Invalid habit date: ${command.date}.`);
      }
      if (!data.habits.some((habit) => habit.id === command.habitId)) {
        return failure(data, "HABIT_NOT_FOUND", `Habit not found: ${command.habitId}.`);
      }
      const existing = data.habitLogs.find(
        (log) => log.habitId === command.habitId && log.date === command.date,
      );
      const nextLog = {
        habitId: command.habitId,
        date: command.date,
        done: !(existing?.done ?? false),
      };
      const habitLogs = existing
        ? data.habitLogs.map((log) =>
            log.habitId === command.habitId && log.date === command.date ? nextLog : log,
          )
        : [...data.habitLogs, nextLog];
      return success(touch({ ...data, habitLogs }, now), nextLog);
    }

    case "maintenance.collectStale": {
      const today = command.today ?? toDateKey(now);
      if (!isValidDateKey(today)) {
        return failure(data, "INVALID_DATE", `Invalid collection date: ${today}.`);
      }
      const cutoff = addDays(today, -1);
      const stale = Object.values(data.daily)
        .flatMap((entry) => entry.tasks)
        .filter(
          (task) =>
            task.status !== "done" &&
            task.scheduledDate !== undefined &&
            task.scheduledDate < cutoff,
        );
      const next = stale.reduce(
        (current, task) =>
          updateTask(current, task.id, {
            status: "pool" satisfies TaskStatus,
            scheduledDate: undefined,
          }, now),
        data,
      );
      return success(stale.length > 0 ? touch(next, now) : data, {
        count: stale.length,
        taskIds: stale.map((task) => task.id),
      });
    }
  }
}

/** Applies a command list atomically: one failure returns the original state. */
export function executePlannerCommands(
  data: PlannerData,
  commands: PlannerCommand[],
  context: CommandContext = {},
): PlannerCommandResult {
  let current = data;
  const values: unknown[] = [];
  const warnings: CommandWarning[] = [];

  for (const command of commands) {
    const result = executePlannerCommand(current, command, context);
    warnings.push(...result.warnings);
    if (!result.ok) {
      return { ...result, data, warnings };
    }
    current = result.data;
    values.push(result.value);
  }

  return { ok: true, data: current, value: { count: commands.length, values }, warnings };
}

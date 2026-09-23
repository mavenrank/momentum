import { nextCustomAreaColor } from "../areas";
import { areaAcceptsPursuit, consolidateDuplicateDomains, resolveArea, resolveDomain, seedDomains, seedOrganizedAreas } from "../organization";
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
  Domain,
  Habit,
  PlannerData,
  Pursuit,
  PursuitStatus,
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
  | "AREA_ARCHIVED"
  | "DOMAIN_NOT_FOUND"
  | "DOMAIN_ARCHIVED"
  | "DOMAIN_EXISTS"
  | "AREA_PURSUIT_MISMATCH"
  | "INVALID_MERGE"
  | "HABIT_EXISTS"
  | "HABIT_NOT_FOUND"
  | "PURSUIT_NOT_FOUND"
  | "PURSUIT_INACTIVE"
  | "PURSUIT_OPEN_TASKS"
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
  | { type: "domain.create"; name: string; color?: string }
  | { type: "domain.consolidateDuplicates" }
  | { type: "domain.update"; domainId: string; patch: Partial<Pick<Domain, "name" | "color" | "archived">> }
  | { type: "area.create"; name: string; domainId?: string; color?: string }
  | { type: "area.update"; areaId: string; patch: Partial<Pick<Area, "name" | "domainId" | "color" | "archived">> }
  | { type: "area.merge"; sourceId: string; targetId: string }
  | { type: "area.restoreDefaults" }
  | { type: "pursuit.create"; name: string; homeAreaId: string }
  | { type: "pursuit.update"; pursuitId: string; patch: Partial<Pick<Pursuit, "name" | "homeAreaId" | "participatingAreaIds" | "status">> }
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
  task: Pick<DailyTask, "title" | "scheduledDate" | "timeOfDay" | "allDay" | "area" | "domainId" | "relatedAreaIds" | "pursuitId">,
  previousArea?: string,
  previousPursuitId?: string,
  previousDomainId?: string,
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
  const area = task.area ? resolveArea(data, task.area, task.domainId) : undefined;
  if (task.area && !area) {
    return { code: "AREA_NOT_FOUND", message: `Unknown area: ${task.area}.` };
  }
  if (area?.archived && area.id !== previousArea) {
    return { code: "AREA_ARCHIVED", message: `Area is archived: ${area.name}.` };
  }
  const domain = area
    ? data.domains.find((entry) => entry.id === area.domainId)
    : task.domainId ? resolveDomain(data.domains, task.domainId) : undefined;
  if ((task.area || task.domainId) && !domain) {
    return { code: "DOMAIN_NOT_FOUND", message: "The task's Domain no longer exists." };
  }
  if (domain?.archived && !(area ? area.id === previousArea : domain.id === previousDomainId)) {
    return { code: "DOMAIN_ARCHIVED", message: `Domain is archived: ${domain.name}.` };
  }
  for (const relatedId of task.relatedAreaIds ?? []) {
    if (!data.areas.some((entry) => entry.id === relatedId)) {
      return { code: "AREA_NOT_FOUND", message: `Unknown related Area: ${relatedId}.` };
    }
  }
  if (new Set(task.relatedAreaIds ?? []).size !== (task.relatedAreaIds ?? []).length || task.relatedAreaIds?.includes(area?.id ?? "")) {
    return { code: "INVALID_TASK", message: "Related Areas must be distinct from each other and the primary Area." };
  }
  const pursuit = task.pursuitId ? data.pursuits.find((entry) => entry.id === task.pursuitId) : undefined;
  if (task.pursuitId && !pursuit) {
    return { code: "PURSUIT_NOT_FOUND", message: `Unknown pursuit: ${task.pursuitId}.` };
  }
  if (pursuit && pursuit.status !== "active" && pursuit.id !== previousPursuitId) {
    return { code: "PURSUIT_INACTIVE", message: `Pursuit is ${pursuit.status}: ${pursuit.name}.` };
  }
  if (pursuit && !areaAcceptsPursuit(pursuit, area?.id)) {
    return { code: "AREA_PURSUIT_MISMATCH", message: "Choose an Area participating in this Pursuit." };
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
  domainId: string | undefined,
  now: Date,
  makeId: () => string,
): PlannerData {
  if (!areaName || resolveArea(data, areaName, domainId)) {
    return data;
  }

  const existingDomain = domainId ? resolveDomain(data.domains, domainId) : undefined;
  const fallback = data.domains.find((domain) => domain.name === "To organize");
  const newDomain: Domain | undefined = existingDomain || fallback ? undefined : {
    id: makeId(), name: "To organize", color: "#6b8f9e", createdAt: now.toISOString(), archived: false,
  };

  return {
    ...data,
    domains: newDomain ? [...data.domains, newDomain] : data.domains,
    areas: [
      ...data.areas,
      {
        id: makeId(),
        name: areaName.trim(),
        domainId: existingDomain?.id ?? fallback?.id ?? newDomain!.id,
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
      if (input.domainId && !resolveDomain(data.domains, input.domainId)) {
        return failure(data, "DOMAIN_NOT_FOUND", `Unknown Domain: ${input.domainId}.`);
      }
      if (input.domainId) input.domainId = resolveDomain(data.domains, input.domainId)!.id;
      if (input.area && !input.domainId && !resolveArea(data, input.area)) {
        const matchingDomain = resolveDomain(data.domains, input.area);
        if (matchingDomain && !data.areas.some((area) => area.name.toLowerCase() === input.area?.toLowerCase())) {
          input.domainId = matchingDomain.id;
          input.area = undefined;
        }
      }
      if (input.area && !resolveArea(data, input.area, input.domainId) && data.areas.filter((area) => area.name.toLowerCase() === input.area?.toLowerCase()).length > 1) {
        return failure(data, "AREA_NOT_FOUND", "Area name is ambiguous. Choose a Domain or use an Area ID.");
      }
      if (input.area && input.domainId && !resolveArea(data, input.area, input.domainId) && data.areas.some((area) => area.name.toLowerCase() === input.area?.toLowerCase())) {
        return failure(data, "AREA_NOT_FOUND", "That Area exists in another Domain. Choose its ID or create this Area explicitly.");
      }
      const pursuit = input.pursuitId ? data.pursuits.find((entry) => entry.id === input.pursuitId) : undefined;
      if (pursuit && !input.area) {
        input.area = pursuit.homeAreaId;
      }
      let base = ensureInputArea(data, input.area, input.domainId, now, makeId);
      const canonicalArea = input.area ? resolveArea(base, input.area, input.domainId)?.id : undefined;
      const canonicalDomain = canonicalArea ? undefined : resolveDomain(base.domains, input.domainId)?.id;
      input.relatedAreaIds = input.relatedAreaIds?.map((value) => resolveArea(base, value)?.id ?? value);
      const shapeError = validateTaskShape(base, { ...input, area: canonicalArea, domainId: canonicalDomain,
        relatedAreaIds: input.relatedAreaIds ?? [] });
      if (shapeError) {
        return { ok: false, data, error: shapeError, warnings: [] };
      }

      const existingIds = new Set(
        Object.values(base.daily).flatMap((entry) => entry.tasks.map((task) => task.id)),
      );
      base = addTask(base, { ...input, area: canonicalArea, domainId: canonicalDomain }, { now, deviceTag: context.deviceTag });
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
      const patch = { ...command.patch };
      if (patch.domainId) patch.domainId = resolveDomain(data.domains, patch.domainId)?.id ?? patch.domainId;
      if (Object.hasOwn(command.patch, "domainId") && !Object.hasOwn(command.patch, "area") && existing.area) {
        patch.area = undefined;
        patch.pursuitId = undefined;
      }
      if (patch.relatedAreaIds) patch.relatedAreaIds = patch.relatedAreaIds.map((value) => resolveArea(data, value)?.id ?? value);
      if (Object.hasOwn(command.patch, "area") && command.patch.area) {
        patch.area = resolveArea(data, command.patch.area, patch.domainId)?.id ?? command.patch.area;
      }
      if (patch.area) patch.domainId = undefined;
      if (Object.hasOwn(command.patch, "domainId") && command.patch.domainId && !patch.area && (!existing.area || Object.hasOwn(command.patch, "area"))) {
        patch.domainId = resolveDomain(data.domains, command.patch.domainId)?.id ?? command.patch.domainId;
      }
      const candidate: DailyTask = { ...existing, ...patch };
      const shapeError = validateTaskShape(data, candidate, existing.area, existing.pursuitId, existing.domainId);
      if (shapeError) {
        return { ok: false, data, error: shapeError, warnings: [] };
      }
      if (candidate.status !== "done" && data.pursuits.some((entry) => entry.id === candidate.pursuitId && entry.status === "completed")) {
        return failure(data, "PURSUIT_INACTIVE", "Resume the completed pursuit before reopening a task.");
      }
      const next = updateTask(data, command.taskId, patch, now);
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
      const task = findTask(data, command.taskId);
      if (!task) {
        return failure(data, "TASK_NOT_FOUND", `Task not found: ${command.taskId}.`);
      }
      if (task.status === "done" && data.pursuits.some((entry) => entry.id === task.pursuitId && entry.status === "completed")) {
        return failure(data, "PURSUIT_INACTIVE", "Resume the completed pursuit before reopening a task.");
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
      const original = findTask(data, command.taskId)!;
      const shapeError = validateTaskShape(next, updated, original.area, original.pursuitId, original.domainId);
      if (shapeError) {
        return { ok: false, data, error: shapeError, warnings: [] };
      }
      const conflict = conflictResult(data, next, updated, policy);
      return conflict ?? success(touch(next, now), updated);
    }

    case "task.returnToPool": {
      const task = findTask(data, command.taskId);
      if (!task) {
        return failure(data, "TASK_NOT_FOUND", `Task not found: ${command.taskId}.`);
      }
      if (data.pursuits.some((entry) => entry.id === task.pursuitId && entry.status === "completed")) {
        return failure(data, "PURSUIT_INACTIVE", "Resume the completed pursuit before reopening a task.");
      }
      const next = returnTaskToPool(data, command.taskId, now);
      return success(touch(next, now), findTask(next, command.taskId));
    }

    case "task.createFollowUp": {
      const parent = findTask(data, command.parentId);
      if (!parent) {
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
            area: parent.area && !data.areas.find((area) => area.id === parent.area)?.archived ? parent.area : undefined,
            domainId: parent.area ? undefined : parent.domainId,
            relatedAreaIds: parent.relatedAreaIds,
            pursuitId: parent.pursuitId,
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

    case "domain.consolidateDuplicates": {
      const next = consolidateDuplicateDomains(data);
      return success(next === data ? data : touch(next, now), { merged: data.domains.length - next.domains.length });
    }

    case "domain.create": {
      const name = command.name.trim();
      if (!name) return failure(data, "INVALID_NAME", "Domain name cannot be empty.");
      if (resolveDomain(data.domains, name)) return failure(data, "DOMAIN_EXISTS", `Domain already exists: ${name}.`);
      const created: Domain = { id: makeId(), name, color: command.color ?? nextCustomAreaColor(data.domains.length),
        createdAt: now.toISOString(), archived: false };
      return success(touch({ ...data, domains: [...data.domains, created] }, now), created);
    }

    case "domain.update": {
      const domain = data.domains.find((entry) => entry.id === command.domainId);
      if (!domain) return failure(data, "DOMAIN_NOT_FOUND", "Domain not found.");
      const name = command.patch.name?.trim();
      if (command.patch.name !== undefined && !name) return failure(data, "INVALID_NAME", "Domain name cannot be empty.");
      if (name && data.domains.some((entry) => entry.id !== domain.id && entry.name.toLowerCase() === name.toLowerCase())) {
        return failure(data, "DOMAIN_EXISTS", `Domain already exists: ${name}.`);
      }
      const updated = { ...domain, ...command.patch, name: name ?? domain.name };
      return success(touch({ ...data, domains: data.domains.map((entry) => entry.id === domain.id ? updated : entry) }, now), updated);
    }

    case "area.create": {
      const name = command.name.trim();
      if (!name) {
        return failure(data, "INVALID_NAME", "Area name cannot be empty.");
      }
      const domain = resolveDomain(data.domains, command.domainId);
      if (!domain) return failure(data, "DOMAIN_NOT_FOUND", "Choose a Domain for this Area.");
      if (domain.archived) return failure(data, "DOMAIN_ARCHIVED", "Restore the Domain before adding Areas.");
      if (data.areas.some((entry) => entry.domainId === domain.id && entry.name.toLowerCase() === name.toLowerCase())) {
        return failure(data, "AREA_EXISTS", `Area already exists: ${name}.`);
      }
      const area: Area = {
        id: makeId(),
        name,
        domainId: domain.id,
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
      const nextDomainId = command.patch.domainId ?? area.domainId;
      const domain = data.domains.find((entry) => entry.id === nextDomainId);
      if (!domain) return failure(data, "DOMAIN_NOT_FOUND", "Destination Domain not found.");
      if (domain.archived) return failure(data, "DOMAIN_ARCHIVED", "Restore the destination Domain first.");
      const duplicate = name || command.patch.domainId
        ? data.areas.find(
            (entry) => entry.id !== area.id && entry.domainId === nextDomainId && entry.name.toLowerCase() === (name ?? area.name).toLowerCase(),
          )
        : undefined;
      if (duplicate) {
        return failure(data, "AREA_EXISTS", `Area already exists: ${name}.`);
      }

      const nextName = name ?? area.name;
      const nextArea = { ...area, ...command.patch, name: nextName };
      const next = {
        ...data,
        areas: data.areas.map((entry) => (entry.id === area.id ? nextArea : entry)),
      };
      return success(touch(next, now), nextArea);
    }

    case "area.merge": {
      if (command.sourceId === command.targetId) {
        return failure(data, "INVALID_MERGE", "Choose two different areas.");
      }
      const source = data.areas.find((area) => area.id === command.sourceId);
      const target = data.areas.find((area) => area.id === command.targetId);
      if (!source || !target) {
        return failure(data, "AREA_NOT_FOUND", "Both areas must exist.");
      }
      if (target.archived) {
        return failure(data, "AREA_ARCHIVED", "Restore the destination area before merging.");
      }
      if (data.pursuits.some((pursuit) => pursuit.homeAreaId === source.id && data.pursuits.some((other) =>
        other.id !== pursuit.id && other.homeAreaId === target.id && other.name.toLowerCase() === pursuit.name.toLowerCase()))) {
        return failure(data, "INVALID_MERGE", "Pursuits with the same name would collide in the destination Area.");
      }
      const daily = Object.fromEntries(Object.entries(data.daily).map(([date, entry]) => [
        date,
        { ...entry, tasks: entry.tasks.map((task) => ({ ...task,
          area: task.area === source.id ? target.id : task.area,
          relatedAreaIds: task.relatedAreaIds?.map((id) => id === source.id ? target.id : id)
            .filter((id, index, ids) => id !== (task.area === source.id ? target.id : task.area) && ids.indexOf(id) === index),
          updatedAt: task.area === source.id || task.relatedAreaIds?.includes(source.id) ? now.toISOString() : task.updatedAt,
        })) },
      ]));
      return success(touch({ ...data, daily, areas: data.areas.map((area) =>
        area.id === source.id ? { ...area, archived: true } : area),
        pursuits: data.pursuits.map((pursuit) => ({ ...pursuit,
          homeAreaId: pursuit.homeAreaId === source.id ? target.id : pursuit.homeAreaId,
          participatingAreaIds: [...new Set(pursuit.participatingAreaIds.map((id) => id === source.id ? target.id : id))]
            .filter((id) => id !== (pursuit.homeAreaId === source.id ? target.id : pursuit.homeAreaId)),
          updatedAt: pursuit.homeAreaId === source.id || pursuit.participatingAreaIds.includes(source.id) ? now.toISOString() : pursuit.updatedAt,
        })),
      }, now), target);
    }

    case "pursuit.create": {
      const name = command.name.trim();
      if (!name) return failure(data, "INVALID_NAME", "Pursuit name cannot be empty.");
      const area = resolveArea(data, command.homeAreaId);
      if (!area) return failure(data, "AREA_NOT_FOUND", "Choose a home Area for this Pursuit.");
      if (area.archived) return failure(data, "AREA_ARCHIVED", "Choose an active home Area.");
      if (data.domains.find((entry) => entry.id === area.domainId)?.archived) return failure(data, "DOMAIN_ARCHIVED", "Restore the home Domain first.");
      if (data.pursuits.some((entry) => entry.homeAreaId === area.id && entry.name.toLowerCase() === name.toLowerCase())) {
        return failure(data, "INVALID_NAME", `Pursuit already exists in this Area: ${name}.`);
      }
      const pursuit: Pursuit = {
        id: makeId(), name, homeAreaId: area.id, participatingAreaIds: [], status: "active",
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      return success(touch({ ...data, pursuits: [...data.pursuits, pursuit] }, now), pursuit);
    }

    case "pursuit.update": {
      const pursuit = data.pursuits.find((entry) => entry.id === command.pursuitId);
      if (!pursuit) return failure(data, "PURSUIT_NOT_FOUND", "Pursuit not found.");
      const name = command.patch.name?.trim();
      if (command.patch.name !== undefined && !name) return failure(data, "INVALID_NAME", "Pursuit name cannot be empty.");
      const area = resolveArea(data, command.patch.homeAreaId ?? pursuit.homeAreaId);
      if (!area) return failure(data, "AREA_NOT_FOUND", "Home Area not found.");
      if (area.archived && area.id !== pursuit.homeAreaId) return failure(data, "AREA_ARCHIVED", "Restore the home Area first.");
      if (data.pursuits.some((entry) => entry.id !== pursuit.id && entry.homeAreaId === area.id && entry.name.toLowerCase() === (name ?? pursuit.name).toLowerCase())) {
        return failure(data, "INVALID_NAME", "Another Pursuit in this Area has that name.");
      }
      const memberAreas = [...new Set(Object.values(data.daily).flatMap((entry) => entry.tasks)
        .filter((task) => task.pursuitId === pursuit.id).map((task) => task.area).filter((id): id is string => Boolean(id)))];
      const participants = [...(command.patch.participatingAreaIds ?? pursuit.participatingAreaIds)];
      if (area.id !== pursuit.homeAreaId && memberAreas.includes(pursuit.homeAreaId)) participants.push(pursuit.homeAreaId);
      if (participants.some((id) => !data.areas.some((entry) => entry.id === id && (!entry.archived || pursuit.participatingAreaIds.includes(id) || memberAreas.includes(id))))) {
        return failure(data, "AREA_NOT_FOUND", "A participating Area is missing or archived.");
      }
      if (memberAreas.some((id) => id !== area.id && !participants.includes(id))) {
        return failure(data, "AREA_PURSUIT_MISMATCH", "Move or detach tasks before removing their Area from this Pursuit.");
      }
      const status: PursuitStatus = command.patch.status ?? pursuit.status;
      if (status === "completed" && pursuit.status !== "completed") {
        const open = Object.values(data.daily).flatMap((entry) => entry.tasks)
          .filter((task) => task.pursuitId === pursuit.id && task.status !== "done");
        if (open.length > 0) return failure(data, "PURSUIT_OPEN_TASKS", `Finish or move ${open.length} open task(s) first.`);
      }
      const next: Pursuit = {
        ...pursuit, ...command.patch, name: name ?? pursuit.name,
        homeAreaId: area.id,
        participatingAreaIds: [...new Set(participants)].filter((id) => id !== area.id),
        status, updatedAt: now.toISOString(),
        completedAt: status === "completed" ? pursuit.completedAt ?? now.toISOString() : undefined,
      };
      return success(touch({ ...data, pursuits: data.pursuits.map((entry) =>
        entry.id === pursuit.id ? next : entry) }, now), next);
    }

    case "area.restoreDefaults": {
      const seeds = seedDomains(makeId, now.toISOString());
      const missingDomains = seeds.filter((seed) => !resolveDomain(data.domains, seed.name));
      const domains = [...data.domains, ...missingDomains];
      const wanted = seedOrganizedAreas(makeId, now.toISOString(), domains);
      const additions = wanted.filter((seed) => !data.areas.some((area) => area.domainId === seed.domainId && area.name === seed.name));
      return success(touch({ ...data, domains, areas: [...data.areas, ...additions] }, now), additions);
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

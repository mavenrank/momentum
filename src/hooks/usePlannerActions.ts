import { useMemo } from "react";
import type { ParsedTask } from "../lib/nlp/taskParser";
import type { PlannerCommandExecutor } from "../lib/application/commands";
import type { DailyTask, TaskStatus } from "../types/planner";

export interface TaskCreationSummary {
  created: number;
  conflicts: number;
}

export interface PlannerActions {
  /** Creates tasks from parsed quick-add lines, minting unknown areas. */
  createFromParsed: (tasks: ParsedTask[], fallbackStatus?: TaskStatus) => TaskCreationSummary;
  patchTask: (taskId: string, patch: Partial<Omit<DailyTask, "id" | "createdAt">>) => void;
  removeTask: (taskId: string) => void;
  toggleDone: (taskId: string) => void;
  moveToDate: (taskId: string, date: string | undefined) => void;
  /** Clears date, time and all-day in one step and sends the task to the Pool. */
  returnToPool: (taskId: string) => void;
  setStatus: (taskId: string, status: TaskStatus) => void;
  createFollowUp: (parentId: string, title: string, scheduledDate?: string) => void;
}

export function usePlannerActions(
  execute: PlannerCommandExecutor,
): PlannerActions {
  return useMemo<PlannerActions>(
    () => ({
      createFromParsed(tasks, fallbackStatus) {
        if (tasks.length === 0) {
          return { created: 0, conflicts: 0 };
        }

        let created = 0;
        let conflicts = 0;
        for (const parsed of tasks) {
          const result = execute({
            type: "task.create",
            input: {
              title: parsed.title,
              area: parsed.area,
              priority: parsed.priority,
              scheduledDate: parsed.scheduledDate,
              timeOfDay: parsed.timeOfDay,
              allDay: parsed.allDay,
              status: parsed.scheduledDate ? "scheduled" : (fallbackStatus ?? "pool"),
            },
            conflictPolicy: "warn",
          });
          if (result.ok) {
            created += 1;
            conflicts += result.warnings.filter((warning) => warning.code === "TIME_CONFLICT").length;
          }
        }
        return { created, conflicts };
      },

      patchTask(taskId, patch) {
        execute({ type: "task.update", taskId, patch, conflictPolicy: "warn" });
      },

      removeTask(taskId) {
        execute({ type: "task.delete", taskId });
      },

      toggleDone(taskId) {
        execute({ type: "task.toggleDone", taskId });
      },

      moveToDate(taskId, date) {
        execute({ type: "task.schedule", taskId, date, conflictPolicy: "warn" });
      },

      returnToPool(taskId) {
        execute({ type: "task.returnToPool", taskId });
      },

      setStatus(taskId, status) {
        execute({ type: "task.update", taskId, patch: { status } });
      },

      createFollowUp(parentId, title, scheduledDate) {
        execute({
          type: "task.createFollowUp",
          parentId,
          title,
          scheduledDate,
          conflictPolicy: "warn",
        });
      },
    }),
    [execute],
  );
}

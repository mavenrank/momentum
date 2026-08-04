import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ParsedTask } from "../lib/nlp/taskParser";
import { findArea, nextCustomAreaColor } from "../lib/areas";
import {
  addTask,
  createId,
  deleteTask,
  returnTaskToPool,
  scheduleTask,
  toggleTaskDone,
  updateTask,
} from "../lib/plannerData";
import type { DailyTask, PlannerData, TaskStatus } from "../types/planner";

export interface PlannerActions {
  /** Creates tasks from parsed quick-add lines, minting unknown areas. */
  createFromParsed: (tasks: ParsedTask[], fallbackStatus?: TaskStatus) => number;
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
  setData: Dispatch<SetStateAction<PlannerData>>,
): PlannerActions {
  return useMemo<PlannerActions>(
    () => ({
      createFromParsed(tasks, fallbackStatus) {
        if (tasks.length === 0) {
          return 0;
        }

        setData((current) => {
          let next = current;

          for (const parsed of tasks) {
            // An unrecognised #tag mints a new area rather than being dropped.
            if (parsed.area && !findArea(next.areas, parsed.area)) {
              next = {
                ...next,
                areas: [
                  ...next.areas,
                  {
                    id: createId(),
                    name: parsed.area,
                    color: nextCustomAreaColor(next.areas.length),
                    createdAt: new Date().toISOString(),
                    archived: false,
                  },
                ],
              };
            }

            const area = parsed.area ? findArea(next.areas, parsed.area)?.name : undefined;

            next = addTask(next, {
              title: parsed.title,
              area,
              priority: parsed.priority,
              scheduledDate: parsed.scheduledDate,
              timeOfDay: parsed.timeOfDay,
              allDay: parsed.allDay,
              status: parsed.scheduledDate ? "scheduled" : (fallbackStatus ?? "pool"),
            });
          }

          return next;
        });

        return tasks.length;
      },

      patchTask(taskId, patch) {
        setData((current) => updateTask(current, taskId, patch));
      },

      removeTask(taskId) {
        setData((current) => deleteTask(current, taskId));
      },

      toggleDone(taskId) {
        setData((current) => toggleTaskDone(current, taskId));
      },

      moveToDate(taskId, date) {
        setData((current) => scheduleTask(current, taskId, date));
      },

      returnToPool(taskId) {
        setData((current) => returnTaskToPool(current, taskId));
      },

      setStatus(taskId, status) {
        setData((current) => updateTask(current, taskId, { status }));
      },

      createFollowUp(parentId, title, scheduledDate) {
        setData((current) =>
          addTask(current, {
            title,
            scheduledDate,
            // Follow-ups land in the Pool for a deliberate triage pass; picking
            // a preset ("in 3 days") schedules it straight away instead.
            status: scheduledDate ? "scheduled" : "pool",
            followUpOf: parentId,
          }),
        );
      },
    }),
    [setData],
  );
}

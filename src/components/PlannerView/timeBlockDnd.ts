import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";

import { formatTimeRangeValue, parseTimeRange } from "@/lib/date";
import { offsetToMinutes, type DayWindow } from "./TimeBlockGrid";
import type { PlannerActions } from "@/hooks/usePlannerActions";
import type { DailyTask } from "@/types/planner";

/** Length given to a task that gains a time by being dropped onto the grid. */
export const DEFAULT_BLOCK_MINUTES = 60;

/**
 * What a drop meant. Both planner lenses drop onto the same kinds of target, so
 * reading the drop lives here rather than being written twice and drifting.
 */
export type TimeBlockDrop =
  | { kind: "pool" }
  | { kind: "unscheduled" }
  | { kind: "allDay"; date: string }
  | { kind: "day"; date: string }
  | { kind: "lane"; date: string; minutes: number };

/**
 * Resolves a dnd-kit event against the droppable IDs the planner registers.
 *
 * Lane drops are the interesting case: the minute is taken from the *top edge*
 * of the dragged card rather than from the cursor, so a task lands where it
 * looks like it will land instead of an inch below wherever you happened to
 * grab it.
 */
export function resolveTimeBlockDrop(
  event: DragMoveEvent | DragEndEvent,
  dayWindow: DayWindow,
): TimeBlockDrop | null {
  const over = event.over;
  if (!over) {
    return null;
  }

  const overId = String(over.id);
  if (overId === "pool") {
    return { kind: "pool" };
  }
  if (overId === "unscheduled") {
    return { kind: "unscheduled" };
  }
  if (overId.startsWith("allday:")) {
    return { kind: "allDay", date: overId.slice(7) };
  }
  if (overId.startsWith("day:")) {
    return { kind: "day", date: overId.slice(4) };
  }
  if (overId.startsWith("lane:")) {
    const top = event.active.rect.current.translated?.top ?? over.rect.top;
    return {
      kind: "lane",
      date: overId.slice(5),
      minutes: offsetToMinutes(top - over.rect.top, dayWindow),
    };
  }

  return null;
}

/**
 * Places a task at a moment, keeping however long it already ran for — moving a
 * two-hour block should not quietly shrink it to the default hour.
 */
export function blockTask(
  actions: PlannerActions,
  tasks: DailyTask[],
  taskId: string,
  date: string,
  startMinutes: number,
): void {
  const task = tasks.find((entry) => entry.id === taskId);
  const existing = parseTimeRange(task?.timeOfDay);
  const duration = existing ? existing.end - existing.start : DEFAULT_BLOCK_MINUTES;

  actions.moveToDate(taskId, date);
  actions.patchTask(taskId, {
    timeOfDay: formatTimeRangeValue({
      start: startMinutes,
      end: Math.min(24 * 60, startMinutes + duration),
    }),
    allDay: undefined,
  });
}

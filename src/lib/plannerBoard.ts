import type { DailyTask } from "@/types/planner";

/** A browsed date shows its schedule; only the real current day carries active work. */
export function tasksForPlannerDay(
  scheduledByDate: ReadonlyMap<string, DailyTask[]>,
  doingTasks: DailyTask[],
  selectedDate: string,
  actualToday: string,
): DailyTask[] {
  const scheduled = scheduledByDate.get(selectedDate) ?? [];
  if (selectedDate !== actualToday) return scheduled;
  return [...scheduled, ...doingTasks.filter((task) => task.scheduledDate !== selectedDate)];
}

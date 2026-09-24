import type { DailyTask } from "@/types/planner";

/** Column labels describe the calendar date, even when the board is browsed. */
export function plannerDayLabel(date: string, today: string): string {
  const utcDay = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const distance = Math.round((utcDay(date) - utcDay(today)) / 86_400_000);
  switch (distance) {
    case -1: return "Yesterday";
    case 0: return "Today";
    case 1: return "Tomorrow";
    case 2: return "Day after tomorrow";
    default: return distance < 0 ? `${-distance} days ago` : `In ${distance} days`;
  }
}

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

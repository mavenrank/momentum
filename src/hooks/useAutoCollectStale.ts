import { useEffect } from "react";
import { addDays, toDateKey } from "../lib/date";
import { allTasks } from "../lib/plannerData";
import type { PlannerCommandExecutor } from "../lib/application/commands";
import type { PlannerData } from "../types/planner";

/**
 * Sweeps anything still unfinished from the day before yesterday or earlier back
 * into the Pool.
 *
 * Yesterday is deliberately left alone — the Today board surfaces it as a
 * leftover column so it can be triaged in place. Older work has already fallen
 * out of view, so rather than rotting on a date that has passed it returns to
 * the Pool to be re-triaged.
 */
export function useAutoCollectStale(
  data: PlannerData,
  execute: PlannerCommandExecutor,
  enabled: boolean,
  onCollect?: (count: number) => void,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Measured against the real today, so browsing back through past days never
    // triggers a sweep.
    const cutoff = addDays(toDateKey(new Date()), -1);
    const stale = allTasks(data).filter(
      (task) =>
        task.status !== "done" &&
        task.scheduledDate !== undefined &&
        task.scheduledDate < cutoff,
    );

    if (stale.length === 0) {
      return;
    }

    const result = execute({ type: "maintenance.collectStale", today: toDateKey(new Date()) });
    if (result.ok) {
      onCollect?.((result.value as { count: number }).count);
    }
    // `data` drives the check; once swept, the tasks no longer match, so this
    // settles after a single pass.
  }, [data, execute, enabled, onCollect]);
}

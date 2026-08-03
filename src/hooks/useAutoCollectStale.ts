import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { addDays, toDateKey } from "../lib/date";
import { allTasks, updateTask } from "../lib/plannerData";
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
  setData: Dispatch<SetStateAction<PlannerData>>,
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

    setData((current) =>
      stale.reduce(
        (next, task) =>
          updateTask(next, task.id, { status: "pool", scheduledDate: undefined }),
        current,
      ),
    );

    onCollect?.(stale.length);
    // `data` drives the check; once swept, the tasks no longer match, so this
    // settles after a single pass.
  }, [data, setData, enabled, onCollect]);
}

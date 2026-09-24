import { describe, expect, test } from "bun:test";

import { tasksForPlannerDay } from "./plannerBoard";
import type { DailyTask } from "@/types/planner";

function task(id: string, scheduledDate: string | undefined, status: DailyTask["status"]): DailyTask {
  return {
    id,
    title: id,
    status,
    scheduledDate,
    relationships: { dependsOn: [], blocks: [], related: [] },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("planner day selection", () => {
  const scheduledBefore = task("before", "2026-09-09", "scheduled");
  const doingLater = task("later", "2026-12-05", "doing");
  const doingUndated = task("undated", undefined, "doing");
  const doingToday = task("today", "2026-09-24", "doing");
  const scheduled = new Map([
    ["2026-09-09", [scheduledBefore]],
    ["2026-09-24", [doingToday]],
    ["2026-12-05", [doingLater]],
  ]);
  const doing = [doingLater, doingUndated, doingToday];

  test("browsing another date shows only tasks scheduled for it", () => {
    expect(tasksForPlannerDay(scheduled, doing, "2026-09-09", "2026-09-24").map((entry) => entry.id)).toEqual(["before"]);
    expect(tasksForPlannerDay(scheduled, doing, "2026-12-05", "2026-09-24").map((entry) => entry.id)).toEqual(["later"]);
  });

  test("the real current day carries active work without duplicating its scheduled tasks", () => {
    expect(tasksForPlannerDay(scheduled, doing, "2026-09-24", "2026-09-24").map((entry) => entry.id)).toEqual(["today", "later", "undated"]);
  });
});

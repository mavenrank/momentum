import { describe, expect, test } from "bun:test";

import { plannerDayLabel, tasksForPlannerDay } from "./plannerBoard";
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

describe("planner column labels", () => {
  test("each date keeps its real relationship to today as the board moves", () => {
    const today = "2026-09-24";
    expect(["2026-09-22", "2026-09-23", "2026-09-24"].map((date) => plannerDayLabel(date, today))).toEqual(["2 days ago", "Yesterday", "Today"]);
    expect(["2026-09-24", "2026-09-25", "2026-09-26"].map((date) => plannerDayLabel(date, today))).toEqual(["Today", "Tomorrow", "Day after tomorrow"]);
  });

  test("counts days correctly across month and year boundaries", () => {
    expect(plannerDayLabel("2027-01-01", "2026-12-31")).toBe("Tomorrow");
    expect(plannerDayLabel("2026-12-29", "2027-01-01")).toBe("3 days ago");
  });
});

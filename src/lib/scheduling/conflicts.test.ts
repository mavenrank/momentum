import { describe, expect, test } from "bun:test";

import {
  findAllTimeConflictPairs,
  findTimeConflicts,
  intervalsOverlap,
  isValidDateKey,
  validateTimeValue,
} from "./conflicts";
import { addTask, createEmptyData } from "../plannerData";
import type { DailyTask } from "../../types/planner";

const task = (id: string, timeOfDay: string, status: DailyTask["status"] = "scheduled") =>
  ({
    id,
    title: id,
    scheduledDate: "2026-08-25",
    timeOfDay,
    status,
    relationships: { dependsOn: [], blocks: [], related: [] },
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  }) satisfies DailyTask;

describe("schedule validation", () => {
  test("validates real dates", () => {
    expect(isValidDateKey("2024-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
  });

  test("rejects backwards and malformed ranges", () => {
    expect(validateTimeValue("14:00-13:00").valid).toBe(false);
    expect(validateTimeValue("24:00").valid).toBe(false);
    expect(validateTimeValue("09:00-10:00")).toMatchObject({
      valid: true,
      start: 540,
      end: 600,
    });
  });

  test("treats adjacent half-open ranges as non-conflicting", () => {
    expect(
      intervalsOverlap(
        { date: "2026-08-25", start: 540, end: 600 },
        { date: "2026-08-25", start: 600, end: 660 },
      ),
    ).toBe(false);
  });

  test("finds only active timed overlaps on the same day", () => {
    const existing = task("existing", "09:00-10:00");
    const done = task("done", "09:00-11:00", "done");
    const data = createEmptyData();
    data.daily["2026-08-25"] = {
      date: "2026-08-25",
      tasks: [existing, done],
      note: "",
      taskReferences: [],
    };

    expect(findTimeConflicts(data, task("candidate", "09:30-10:30"))).toEqual([
      {
        taskId: "existing",
        title: "existing",
        interval: { date: "2026-08-25", start: 540, end: 600 },
      },
    ]);
  });

  test("finds each store-wide overlap once and ignores completed tasks", () => {
    const data = createEmptyData();
    const withFirst = addTask(data, {
      title: "First",
      scheduledDate: "2026-08-25",
      timeOfDay: "09:00-11:00",
    });
    const withSecond = addTask(withFirst, {
      title: "Second",
      scheduledDate: "2026-08-25",
      timeOfDay: "10:00-12:00",
    });
    const withDone = addTask(withSecond, {
      title: "Done",
      scheduledDate: "2026-08-25",
      timeOfDay: "10:30-11:30",
      status: "done",
    });

    expect(findAllTimeConflictPairs(withDone)).toHaveLength(1);
    expect(findAllTimeConflictPairs(withDone)[0]).toMatchObject({
      first: { title: "First" },
      second: { title: "Second" },
    });
  });
});

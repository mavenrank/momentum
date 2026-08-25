import { describe, expect, test } from "bun:test";

import { executePlannerCommand, executePlannerCommands } from "./commands";
import { createEmptyData } from "../plannerData";
import type { DailyTask } from "../../types/planner";

const context = {
  now: new Date("2026-08-25T10:00:00.000Z"),
  deviceTag: "tt",
  createEntityId: (() => {
    let next = 0;
    return () => `entity-${++next}`;
  })(),
};

describe("planner commands", () => {
  test("creates unknown areas and canonicalises their use", () => {
    const result = executePlannerCommand(
      createEmptyData(),
      {
        type: "task.create",
        input: { title: "Plant basil", area: "Gardening" },
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas.some((area) => area.name === "Gardening")).toBe(true);
    expect((result.value as DailyTask).area).toBe("Gardening");
  });

  test("rejects a conflicting CLI-style command without modifying data", () => {
    const first = executePlannerCommand(
      createEmptyData(),
      {
        type: "task.create",
        input: {
          title: "First",
          scheduledDate: "2026-08-26",
          timeOfDay: "09:00-10:00",
        },
      },
      context,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = executePlannerCommand(
      first.data,
      {
        type: "task.create",
        input: {
          title: "Second",
          scheduledDate: "2026-08-26",
          timeOfDay: "09:30-10:30",
        },
        conflictPolicy: "reject",
      },
      context,
    );

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("TIME_CONFLICT");
    expect(second.data).toBe(first.data);
  });

  test("warns but accepts a UI-style conflict", () => {
    const result = executePlannerCommands(
      createEmptyData(),
      [
        {
          type: "task.create",
          input: {
            title: "First",
            scheduledDate: "2026-08-26",
            timeOfDay: "09:00-10:00",
          },
        },
        {
          type: "task.create",
          input: {
            title: "Second",
            scheduledDate: "2026-08-26",
            timeOfDay: "09:30-10:30",
          },
          conflictPolicy: "warn",
        },
      ],
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  test("keeps batches atomic on failure", () => {
    const original = createEmptyData();
    const result = executePlannerCommands(
      original,
      [
        { type: "task.create", input: { title: "Valid" } },
        { type: "task.create", input: { title: "" } },
      ],
      context,
    );

    expect(result.ok).toBe(false);
    expect(result.data).toBe(original);
  });

  test("journal writes preserve full tagged references", () => {
    const result = executePlannerCommand(
      createEmptyData(),
      {
        type: "journal.set",
        date: "2026-08-25",
        note: "Worked on @T-20260825-0042-ab",
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.daily["2026-08-25"].taskReferences).toEqual([
      "T-20260825-0042-ab",
    ]);
  });
});

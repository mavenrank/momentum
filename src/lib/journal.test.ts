import { describe, expect, test } from "bun:test";

import { extractTaskReferences, toNoteSegments } from "./journal";
import {
  generateTaskId,
  isTaskId,
  parseTaskIdCounter,
  parseTaskIdDevice,
} from "./taskId";

describe("journal task references", () => {
  test("preserves a device-tagged task ID exactly", () => {
    const id = generateTaskId("2026-08-25", 42, "ab");

    expect(isTaskId(id)).toBe(true);
    expect(parseTaskIdCounter(id)).toBe(42);
    expect(parseTaskIdDevice(id)).toBe("ab");
    expect(extractTaskReferences(`Follow up on @${id} today`)).toEqual([id]);
  });

  test("continues to support legacy untagged IDs", () => {
    expect(extractTaskReferences("Completed @T-20260825-0042.")).toEqual([
      "T-20260825-0042",
    ]);
  });

  test("does not accept a valid task ID as a prefix of invalid text", () => {
    expect(extractTaskReferences("Broken @T-20260825-0042-ab-extra")).toEqual([]);
  });

  test("de-duplicates references without truncating segments", () => {
    const id = "T-20260825-0042-z9";
    const note = `@${id} then @${id}`;

    expect(extractTaskReferences(note)).toEqual([id]);
    expect(toNoteSegments(note)).toEqual([
      { text: `@${id}`, taskId: id },
      { text: " then " },
      { text: `@${id}`, taskId: id },
    ]);
  });
});

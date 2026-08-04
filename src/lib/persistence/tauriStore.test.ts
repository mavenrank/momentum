import { describe, expect, test } from "bun:test";

import {
  META_FILE,
  MONTHS_DIR,
  assemble,
  diffFiles,
  projectToFiles,
  serialise,
  type MonthFile,
  type StoreContents,
} from "./tauriStore";
import type { DailyTask, PlannerData } from "../../types/planner";

const NOW = "2026-08-04T10:00:00.000Z";

function task(id: string, overrides: Partial<DailyTask> = {}): DailyTask {
  return {
    id,
    title: id,
    status: "pool",
    relationships: { dependsOn: [], blocks: [], related: [] },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function data(overrides: Partial<PlannerData> = {}): PlannerData {
  return {
    version: 2,
    daily: {},
    weekly: {},
    habits: [],
    habitLogs: [],
    areas: [{ id: "a1", name: "Work", color: "#287c76", createdAt: NOW, archived: false }],
    nextTaskId: 1,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Reads a set of projected files back the way the loader would. */
function parse(files: Map<string, string>): StoreContents {
  const months: Record<string, MonthFile> = {};
  for (const [path, contents] of files) {
    if (path.startsWith(`${MONTHS_DIR}/`)) {
      months[path.slice(MONTHS_DIR.length + 1).replace(/\.json$/, "")] = JSON.parse(
        contents,
      ) as MonthFile;
    }
  }

  const read = <T>(name: string, fallback: T): T => {
    const raw = files.get(name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  };

  return {
    meta: read(META_FILE, null),
    areas: read("areas.json", []),
    habits: read("habits.json", []),
    habitLogs: read("habit-logs.json", []),
    weekly: read("weeks.json", {}),
    months,
  };
}

describe("serialise", () => {
  test("sorts keys so a diff only ever shows a real change", () => {
    expect(serialise({ b: 1, a: 2 })).toBe(serialise({ a: 2, b: 1 }));
  });

  test("matches what momentum-data.mjs writes: two spaces and a trailing newline", () => {
    expect(serialise({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });

  test("sorts nested keys too", () => {
    expect(serialise({ outer: { z: 1, a: 2 } })).toBe(serialise({ outer: { a: 2, z: 1 } }));
  });
});

describe("projectToFiles", () => {
  test("files a task under the month it was created, not the one it is scheduled in", () => {
    const files = projectToFiles(
      data({
        daily: {
          "2026-08-04": {
            date: "2026-08-04",
            tasks: [
              task("T-20260804-0001", {
                createdAt: "2026-08-04T09:00:00.000Z",
                scheduledDate: "2026-12-25",
                status: "scheduled",
              }),
            ],
            note: "",
            taskReferences: [],
          },
        },
      }),
    );

    expect(files.has(`${MONTHS_DIR}/2026-08.json`)).toBe(true);
    expect(files.has(`${MONTHS_DIR}/2026-12.json`)).toBe(false);
  });

  test("skips a day that has neither a note nor a reference", () => {
    const files = projectToFiles(
      data({
        daily: {
          "2026-08-04": { date: "2026-08-04", tasks: [], note: "", taskReferences: [] },
        },
      }),
    );

    expect(files.has(`${MONTHS_DIR}/2026-08.json`)).toBe(false);
  });

  test("orders tasks by id so the file does not churn on reload", () => {
    const build = (ids: string[]) =>
      projectToFiles(
        data({
          daily: {
            "2026-08-04": {
              date: "2026-08-04",
              tasks: ids.map((id) => task(id)),
              note: "",
              taskReferences: [],
            },
          },
        }),
      ).get(`${MONTHS_DIR}/2026-08.json`);

    expect(build(["T-20260804-0002", "T-20260804-0001"])).toBe(
      build(["T-20260804-0001", "T-20260804-0002"]),
    );
  });
});

describe("round trip", () => {
  test("survives a write and a read", () => {
    const original = data({
      daily: {
        "2026-08-04": {
          date: "2026-08-04",
          tasks: [task("T-20260804-0001", { title: "Ship it", status: "doing" })],
          note: "Started on the shell.",
          taskReferences: ["T-20260804-0001"],
        },
      },
      weekly: { "2026-08-03": { weekStart: "2026-08-03", notes: "Quiet week" } },
      habitLogs: [{ habitId: "h1", date: "2026-08-04", done: true }],
      nextTaskId: 2,
    });

    const restored = assemble(parse(projectToFiles(original)));

    expect(Object.keys(restored.daily)).toEqual(["2026-08-04"]);
    expect(restored.daily["2026-08-04"].tasks.map((t) => t.id)).toEqual(["T-20260804-0001"]);
    expect(restored.daily["2026-08-04"].tasks[0].title).toBe("Ship it");
    expect(restored.daily["2026-08-04"].note).toBe("Started on the shell.");
    expect(restored.daily["2026-08-04"].taskReferences).toEqual(["T-20260804-0001"]);
    expect(restored.weekly["2026-08-03"].notes).toBe("Quiet week");
    expect(restored.habitLogs).toEqual([{ habitId: "h1", date: "2026-08-04", done: true }]);
    expect(restored.areas.map((area) => area.name)).toContain("Work");
  });

  test("rebuilds the id counter from the tasks on disk", () => {
    const original = data({
      daily: {
        "2026-08-04": {
          date: "2026-08-04",
          tasks: [task("T-20260804-0042")],
          note: "",
          taskReferences: [],
        },
      },
      // Deliberately stale, as it would be after a hand-edit or a half-sync.
      nextTaskId: 1,
    });

    expect(assemble(parse(projectToFiles(original))).nextTaskId).toBe(43);
  });
});

describe("diffFiles", () => {
  const withTask = (month: string, id: string, note: string) =>
    projectToFiles(
      data({
        daily: {
          [`${month}-04`]: {
            date: `${month}-04`,
            tasks: [task(id, { createdAt: `${month}-04T09:00:00.000Z` })],
            note,
            taskReferences: [],
          },
        },
      }),
    );

  test("leaves an untouched month alone", () => {
    const before = new Map([...withTask("2026-07", "T-20260704-0001", "")]);
    const after = new Map([
      ...withTask("2026-07", "T-20260704-0001", ""),
      [`${MONTHS_DIR}/2026-08.json`, serialise({ tasks: [], notes: {} })],
    ]);

    const changes = diffFiles(before, after);

    expect([...changes.write.keys()]).toEqual([`${MONTHS_DIR}/2026-08.json`]);
    expect(changes.remove).toEqual([]);
  });

  test("rewrites a month whose contents changed", () => {
    const changes = diffFiles(
      withTask("2026-08", "T-20260804-0001", ""),
      withTask("2026-08", "T-20260804-0001", "now with a note"),
    );

    expect([...changes.write.keys()]).toContain(`${MONTHS_DIR}/2026-08.json`);
  });

  test("removes a month that no longer has anything in it", () => {
    const changes = diffFiles(withTask("2026-08", "T-20260804-0001", ""), projectToFiles(data()));

    expect(changes.remove).toEqual([`${MONTHS_DIR}/2026-08.json`]);
  });

  test("writes nothing when nothing moved", () => {
    const files = withTask("2026-08", "T-20260804-0001", "steady");
    const changes = diffFiles(files, withTask("2026-08", "T-20260804-0001", "steady"));

    expect(changes.write.size).toBe(0);
    expect(changes.remove).toEqual([]);
  });
});

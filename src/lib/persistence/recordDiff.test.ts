import { describe, expect, test } from "bun:test";

import { diffRecords, indexBy, stableStringify } from "./recordDiff";

const NOW = "2026-08-04T10:00:00.000Z";

interface Row {
  id: string;
  title?: string;
  tags?: string[];
  updatedAt?: string;
  deletedAt?: string;
}

const rows = (...entries: Row[]) => indexBy(entries, (row) => row.id);

describe("stableStringify", () => {
  test("ignores the order properties were built in", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  test("ignores the fields the writer owns", () => {
    expect(stableStringify({ a: 1, updatedAt: "x", deletedAt: "y" })).toBe(
      stableStringify({ a: 1 }),
    );
  });

  test("treats an absent field and an undefined one alike", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  test("still distinguishes real differences", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
    expect(stableStringify({ tags: ["x", "y"] })).not.toBe(stableStringify({ tags: ["y", "x"] }));
  });
});

describe("diffRecords", () => {
  test("writes nothing when nothing changed", () => {
    const before = rows({ id: "a", title: "One" }, { id: "b", title: "Two" });
    // Rebuilt objects, as the app produces on every edit.
    const after = rows({ title: "One", id: "a" }, { title: "Two", id: "b" });

    const changes = diffRecords(before, after, NOW);
    expect(changes.puts).toHaveLength(0);
    expect(changes.tombstones).toHaveLength(0);
  });

  test("writes only the record that changed", () => {
    const before = rows({ id: "a", title: "One" }, { id: "b", title: "Two" });
    const after = rows({ id: "a", title: "One" }, { id: "b", title: "Changed" });

    const changes = diffRecords(before, after, NOW);
    expect(changes.puts.map((row) => row.id)).toEqual(["b"]);
    expect(changes.puts[0].updatedAt).toBe(NOW);
  });

  test("stamps a new record", () => {
    const changes = diffRecords(rows(), rows({ id: "a" }), NOW);
    expect(changes.puts).toEqual([{ id: "a", updatedAt: NOW }]);
  });

  test("tombstones a removal instead of dropping the row", () => {
    const changes = diffRecords(rows({ id: "a", title: "One" }), rows(), NOW);
    expect(changes.puts).toHaveLength(0);
    expect(changes.tombstones).toEqual([
      { id: "a", title: "One", updatedAt: NOW, deletedAt: NOW },
    ]);
  });

  test("does not re-tombstone a record already marked deleted", () => {
    const before = rows({ id: "a", deletedAt: "2026-01-01T00:00:00.000Z" });
    const changes = diffRecords(before, rows(), NOW);
    expect(changes.tombstones).toHaveLength(0);
  });

  test("revives a tombstoned record when it comes back", () => {
    const before = rows({ id: "a", title: "One", deletedAt: "2026-01-01T00:00:00.000Z" });
    const changes = diffRecords(before, rows({ id: "a", title: "One" }), NOW);

    expect(changes.puts).toHaveLength(1);
    expect(changes.puts[0].deletedAt).toBeUndefined();
    expect(changes.puts[0].updatedAt).toBe(NOW);
  });

  test("handles an edit, an addition and a removal at once", () => {
    const before = rows({ id: "a", title: "One" }, { id: "b", title: "Two" });
    const after = rows({ id: "a", title: "Edited" }, { id: "c", title: "Three" });

    const changes = diffRecords(before, after, NOW);
    expect(changes.puts.map((row) => row.id).sort()).toEqual(["a", "c"]);
    expect(changes.tombstones.map((row) => row.id)).toEqual(["b"]);
  });

  test("sees a change inside a nested array", () => {
    const before = rows({ id: "a", tags: ["x"] });
    const after = rows({ id: "a", tags: ["x", "y"] });
    expect(diffRecords(before, after, NOW).puts).toHaveLength(1);
  });
});

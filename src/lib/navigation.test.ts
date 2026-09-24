import { describe, expect, test } from "bun:test";
import { routeFromPath, routePath } from "./navigation";

describe("app routes", () => {
  test("links to a task by its stable ID", () => {
    const route = { kind: "task" as const, taskId: "T-20260924-0001@desk" };
    expect(routeFromPath(routePath(route))).toEqual(route);
  });

  test("falls back safely for unknown and malformed paths", () => {
    expect(routeFromPath("/unknown")).toEqual({ kind: "planner" });
    expect(routeFromPath("/tasks/%ZZ")).toEqual({ kind: "tasks" });
  });
});

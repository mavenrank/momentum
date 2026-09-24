import type { ViewMode } from "@/types/planner";

export type AppRoute = { kind: ViewMode } | { kind: "task"; taskId: string };

const destinations: ViewMode[] = ["planner", "tasks", "calendar", "pursuits", "settings"];

export function routeFromPath(pathname: string): AppRoute {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "tasks" && parts.length === 2) {
    try {
      return { kind: "task", taskId: decodeURIComponent(parts[1]) };
    } catch {
      return { kind: "tasks" };
    }
  }
  if (parts.length === 1 && destinations.includes(parts[0] as ViewMode)) {
    return { kind: parts[0] as ViewMode };
  }
  return { kind: "planner" };
}

export function routePath(route: AppRoute): string {
  return route.kind === "task" ? `/tasks/${encodeURIComponent(route.taskId)}` : `/${route.kind}`;
}

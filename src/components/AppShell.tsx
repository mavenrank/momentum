import * as React from "react";

import { TopNav } from "./TopNav";
import { CalendarView } from "./CalendarView/CalendarView";
import { HabitsView } from "./HabitsView/HabitsView";
import { PlannerView } from "./PlannerView/PlannerView";
import { PursuitsView } from "./PursuitsView/PursuitsView";
import { TaskPage } from "./TasksView/TaskPage";
import { TasksView } from "./TasksView/TasksView";
import { SettingsView } from "./SettingsView/SettingsView";
import type { SettingsSection } from "./SettingsView/SettingsSidebar";
import { useAutoCollectStale } from "@/hooks/useAutoCollectStale";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useToast } from "@/components/ui/toast";
import { toDateKey } from "@/lib/date";
import { routeFromPath, routePath, type AppRoute } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { PlannerLens, ViewMode } from "@/types/planner";

export function AppShell() {
  const [route, setRoute] = React.useState<AppRoute>(() => routeFromPath(window.location.pathname));
  const mode: ViewMode = route.kind === "task" ? "tasks" : route.kind;
  const [settingsSection, setSettingsSection] = React.useState<SettingsSection>("guide");
  const [lens, setLens] = React.useState<PlannerLens>("today");
  const [selectedDate, setSelectedDate] = React.useState(() => toDateKey(new Date()));
  const planner = usePlannerData();
  const { toast } = useToast();

  React.useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = React.useCallback((next: AppRoute) => {
    const path = routePath(next);
    if (window.location.pathname !== path) {
      window.history.pushState({ from: window.location.pathname + window.location.search }, "", path);
    }
    setRoute(next);
  }, []);

  const openTask = React.useCallback((taskId: string) => navigate({ kind: "task", taskId }), [navigate]);
  const openTasks = React.useCallback(() => navigate({ kind: "tasks" }), [navigate]);
  const backFromTask = React.useCallback(() => {
    const previous = window.history.state?.from;
    if (typeof previous === "string" && previous.startsWith("/")) window.history.back();
    else openTasks();
  }, [openTasks]);

  const announceCollected = React.useCallback(
    (count: number) => {
      toast(
        `${count} overdue task${count === 1 ? "" : "s"} moved back to the Pool.`,
      );
    },
    [toast],
  );

  useAutoCollectStale(planner.data, planner.execute, !planner.loading, announceCollected);

  const shared = {
    data: planner.data,
    execute: planner.execute,
    selectedDate,
    setSelectedDate,
  };

  /** Picking a day anywhere lands you in the Today view for that date. */
  const openDay = React.useCallback((date: string) => {
    setSelectedDate(date);
    setLens("today");
    navigate({ kind: "planner" });
  }, [navigate]);

  return (
    <div className="flex h-dvh flex-col">
      <TopNav
        mode={mode}
        onChange={(next) => navigate({ kind: next })}
        storageError={planner.storageError}
        onOpenStorageError={() => {
          setSettingsSection("data");
          navigate({ kind: "settings" });
        }}
      />

      <main
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          // The calendar owns its own scrolling and runs edge to edge.
          mode === "calendar" || mode === "settings" || route.kind === "tasks" ? "overflow-hidden" : "overflow-y-auto p-3",
        )}
      >
        {planner.loading ? (
          <p className="m-auto text-sm text-muted-foreground">Loading your planner…</p>
        ) : (
          <div className="min-h-0 flex-1">
            {route.kind === "planner" ? (
              <PlannerView {...shared} lens={lens} setLens={setLens} onOpenDay={openDay} onOpenTask={openTask} />
            ) : null}
            {route.kind === "tasks" ? <TasksView data={planner.data} onOpenTask={openTask} /> : null}
            {route.kind === "task" ? <TaskPage data={planner.data} execute={planner.execute} taskId={route.taskId} onBack={backFromTask} onOpenTask={openTask} onOpenTasks={openTasks} onOpenDay={openDay} /> : null}
            {route.kind === "calendar" ? <CalendarView {...shared} onOpenDay={openDay} onOpenTask={openTask} /> : null}
            {route.kind === "habits" ? <HabitsView {...shared} /> : null}
            {route.kind === "pursuits" ? <PursuitsView data={planner.data} execute={planner.execute} onOpenTask={openTask} /> : null}
            {route.kind === "settings" ? (
              <SettingsView data={planner.data} execute={planner.execute} replaceData={planner.replaceData} section={settingsSection} onSectionChange={setSettingsSection} />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

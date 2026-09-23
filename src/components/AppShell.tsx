import * as React from "react";

import { TopNav } from "./TopNav";
import { CalendarView } from "./CalendarView/CalendarView";
import { DataView } from "./DataView/DataView";
import { HabitsView } from "./HabitsView/HabitsView";
import { PlannerView } from "./PlannerView/PlannerView";
import { SettingsView } from "./SettingsView/SettingsView";
import { useAutoCollectStale } from "@/hooks/useAutoCollectStale";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useToast } from "@/components/ui/toast";
import { toDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { PlannerLens, ViewMode } from "@/types/planner";

export function AppShell() {
  const [mode, setMode] = React.useState<ViewMode>("planner");
  const [lens, setLens] = React.useState<PlannerLens>("today");
  const [selectedDate, setSelectedDate] = React.useState(() => toDateKey(new Date()));
  const planner = usePlannerData();
  const { toast } = useToast();

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
    setMode("planner");
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <TopNav
        mode={mode}
        onChange={setMode}
        storageError={planner.storageError}
        onOpenStorageError={() => setMode("data")}
      />

      <main
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          // The calendar owns its own scrolling and runs edge to edge.
          mode === "calendar" ? "overflow-hidden" : "overflow-y-auto p-3",
        )}
      >
        {planner.loading ? (
          <p className="m-auto text-sm text-muted-foreground">Loading your planner…</p>
        ) : (
          /* Keyed on the section so each switch gets a soft entrance. */
          <div key={mode} className="view-enter min-h-0 flex-1">
            {mode === "planner" ? (
              <PlannerView {...shared} lens={lens} setLens={setLens} onOpenDay={openDay} />
            ) : null}
            {mode === "calendar" ? <CalendarView {...shared} onOpenDay={openDay} /> : null}
            {mode === "habits" ? <HabitsView {...shared} /> : null}
            {mode === "data" ? (
              <DataView data={planner.data} replaceData={planner.replaceData} />
            ) : null}
            {mode === "settings" ? (
              <SettingsView data={planner.data} execute={planner.execute} />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

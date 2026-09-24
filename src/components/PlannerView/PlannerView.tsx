import type * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlannerActions } from "@/hooks/usePlannerActions";
import { isTimeBlocking, setTimeBlocking, usePreferences } from "@/lib/preferences";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import { TodayView } from "./TodayView/TodayView";
import { WeekView } from "./WeekView/WeekView";
import type { PlannerData, PlannerLens } from "@/types/planner";

interface PlannerViewProps {
  data: PlannerData;
  execute: PlannerCommandExecutor;
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  lens: PlannerLens;
  setLens: (lens: PlannerLens) => void;
  onOpenDay: (date: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function PlannerView({
  data,
  execute,
  selectedDate,
  setSelectedDate,
  lens,
  setLens,
  onOpenDay,
  onOpenTask,
}: PlannerViewProps) {
  const actions = usePlannerActions(execute);
  const preferences = usePreferences();
  // Owned here rather than inside a lens, so the mode survives switching between
  // them — and so the Settings toggle that links the two has one place to act on.
  const timeBlocking = isTimeBlocking(preferences, lens);

  /**
   * The lens switch is handed to the active view rather than sitting in a strip
   * of its own. It belongs beside the date controls it modifies, and a row above
   * the workspace spent a whole line of height saying very little.
   */
  const lensControl = (
    <Tabs value={lens} onValueChange={(value) => setLens(value as PlannerLens)}>
      <TabsList>
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <div className="h-full min-h-0">
      {lens === "today" ? (
        <TodayView
          data={data}
          actions={actions}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          lensControl={lensControl}
          timeBlocking={timeBlocking}
          onTimeBlockingChange={(on) => setTimeBlocking("today", on)}
          onOpenTask={onOpenTask}
        />
      ) : (
        <WeekView
          data={data}
          execute={execute}
          actions={actions}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onOpenDay={onOpenDay}
          onOpenTask={onOpenTask}
          lensControl={lensControl}
          timeBlocking={timeBlocking}
          onTimeBlockingChange={(on) => setTimeBlocking("week", on)}
        />
      )}
    </div>
  );
}

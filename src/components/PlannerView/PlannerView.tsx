import type { Dispatch, SetStateAction } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlannerActions } from "@/hooks/usePlannerActions";
import { TodayView } from "./TodayView/TodayView";
import { WeekView } from "./WeekView/WeekView";
import type { PlannerData, PlannerLens } from "@/types/planner";

interface PlannerViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  lens: PlannerLens;
  setLens: (lens: PlannerLens) => void;
  onOpenDay: (date: string) => void;
}

export function PlannerView({
  data,
  setData,
  selectedDate,
  setSelectedDate,
  lens,
  setLens,
  onOpenDay,
}: PlannerViewProps) {
  const actions = usePlannerActions(setData);

  return (
    <div className="flex h-full flex-col gap-3">
      <Tabs value={lens} onValueChange={(value) => setLens(value as PlannerLens)}>
        <TabsList className="h-8">
          <TabsTrigger value="today" className="text-xs">
            Today
          </TabsTrigger>
          <TabsTrigger value="week" className="text-xs">
            Week
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div key={lens} className="view-enter min-h-0 flex-1">
        {lens === "today" ? (
          <TodayView
            data={data}
            actions={actions}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
        ) : (
          <WeekView
            data={data}
            setData={setData}
            actions={actions}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onOpenDay={onOpenDay}
          />
        )}
      </div>
    </div>
  );
}

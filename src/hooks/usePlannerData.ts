import { useEffect, useMemo, useState } from "react";
import type { PlannerData } from "../types/planner";
import { loadPlannerData, savePlannerData } from "../lib/plannerData";

export function usePlannerData() {
  const [data, setData] = useState<PlannerData>(() => loadPlannerData());

  useEffect(() => {
    savePlannerData(data);
  }, [data]);

  const api = useMemo(
    () => ({
      data,
      setData,
      replaceData: setData,
    }),
    [data],
  );

  return api;
}

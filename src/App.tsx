import { CalendarCheck, CalendarDays, Database, ListChecks, NotebookPen, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { DataView } from "./components/DataView/DataView";
import { DailyView } from "./components/DailyView/DailyView";
import { HabitsView } from "./components/HabitsView/HabitsView";
import { ModeTabs } from "./components/ModeTabs/ModeTabs";
import { MonthlyView } from "./components/MonthlyView/MonthlyView";
import { JournalView } from "./components/NotesView/NotesView";
import { WeeklyView } from "./components/WeeklyView/WeeklyView";
import { toDateKey } from "./lib/date";
import { usePlannerData } from "./hooks/usePlannerData";
import type { ViewMode } from "./types/planner";
import "./App.css";

const modes = [
  { id: "daily", label: "Daily", icon: CalendarCheck },
  { id: "weekly", label: "Weekly", icon: Target },
  { id: "monthly", label: "Monthly", icon: CalendarDays },
  { id: "habits", label: "Habits", icon: ListChecks },
  { id: "journal", label: "Journal", icon: NotebookPen },
  { id: "data", label: "Data", icon: Database },
] satisfies Array<{ id: ViewMode; label: string; icon: typeof CalendarCheck }>;

export function App() {
  const [mode, setMode] = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const planner = usePlannerData();

  const activeView = useMemo(() => {
    const sharedProps = {
      data: planner.data,
      setData: planner.setData,
      selectedDate,
      setSelectedDate,
    };

    switch (mode) {
      case "weekly":
        return <WeeklyView {...sharedProps} />;
      case "habits":
        return <HabitsView {...sharedProps} />;
      case "monthly":
        return <MonthlyView {...sharedProps} />;
      case "journal":
        return <JournalView {...sharedProps} />;
      case "data":
        return <DataView data={planner.data} replaceData={planner.replaceData} />;
      case "daily":
      default:
        return <DailyView {...sharedProps} />;
    }
  }, [mode, planner.data, planner.replaceData, planner.setData, selectedDate]);

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <span className="brand-mark">M</span>
          <div>
            <h1>Momentum</h1>
            <p>Plan. Track. Reflect.</p>
          </div>
        </div>
        <ModeTabs activeMode={mode} modes={modes} onChange={setMode} />
      </aside>
      <section className="app-workspace">{activeView}</section>
    </main>
  );
}

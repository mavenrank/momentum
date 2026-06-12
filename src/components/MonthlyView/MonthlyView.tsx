import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  addMonths,
  formatMonth,
  getMonthCalendarDays,
  startOfMonthKey,
  toDateKey,
} from "../../lib/date";
import type { PlannerData } from "../../types/planner";
import "./MonthlyView.css";

interface MonthlyViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthlyView({ data, selectedDate, setSelectedDate }: MonthlyViewProps) {
  const monthStart = startOfMonthKey(selectedDate);
  const monthDays = getMonthCalendarDays(selectedDate);
  const activeMonth = monthStart.slice(0, 7);

  return (
    <>
      <header className="view-header">
        <div className="month-title-row">
          <h2>Monthly View</h2>
          <span>{formatMonth(monthStart)}</span>
        </div>
        <div className="month-controls">
          <button
            className="icon-button"
            title="Previous month"
            type="button"
            onClick={() => setSelectedDate(addMonths(monthStart, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            title="Next month"
            type="button"
            onClick={() => setSelectedDate(addMonths(monthStart, 1))}
          >
            <ChevronRight size={18} />
          </button>
          <button className="ghost-button" type="button" onClick={() => setSelectedDate(toDateKey(new Date()))}>
            Today
          </button>
        </div>
      </header>

      <section className="planner-panel month-panel">
        <div className="month-week-labels">
          {weekLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="month-grid">
          {monthDays.map((dateKey) => {
            const entry = data.daily[dateKey];
            const tasks = (entry?.tasks ?? []).filter((task) => task.title.trim());
            const done = tasks.filter((task) => task.status === "done").length;
            const percent = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            const p1 = tasks.filter((task) => task.priority === "P1").length;
            const isOutsideMonth = !dateKey.startsWith(activeMonth);

            return (
              <button
                className={[
                  "month-day",
                  dateKey === selectedDate ? "active" : "",
                  isOutsideMonth ? "muted" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
              >
                <span className="month-date-number">{dateKey.slice(8)}</span>
                <div className="month-day-metrics">
                  {tasks.length === 0 ? (
                    <small>0 tasks</small>
                  ) : (
                    <>
                      <strong>{percent}%</strong>
                      <span>
                        {done}/{tasks.length} done
                      </span>
                      {p1 > 0 ? <em>{p1} P1</em> : null}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

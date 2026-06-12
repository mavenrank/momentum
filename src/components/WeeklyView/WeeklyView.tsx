import type { Dispatch, SetStateAction } from "react";
import { DatePicker } from "../DatePicker/DatePicker";
import { formatFriendlyDate, getWeekDays, startOfWeekKey } from "../../lib/date";
import { ensureWeekly } from "../../lib/plannerData";
import type { DailyTask, PlannerData, WeeklyEntry } from "../../types/planner";
import "./WeeklyView.css";

interface WeeklyViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export function WeeklyView({ data, setData, selectedDate, setSelectedDate }: WeeklyViewProps) {
  const weekStart = startOfWeekKey(selectedDate);
  const entry = ensureWeekly(data, selectedDate);
  const weekDays = getWeekDays(weekStart);
  const weekTasks = weekDays.flatMap((date) =>
    (data.daily[date]?.tasks ?? []).map((task) => ({ ...task, date })),
  );
  const criticalTasks = weekTasks
    .filter((task) => task.status !== "done" && (task.priority === "P1" || task.priority === "P2"))
    .slice(0, 8);
  const waitingTasks = weekTasks.filter((task) => task.status === "waiting").slice(0, 8);
  const carryForwardTasks = weekTasks
    .filter((task) => task.status !== "done" && task.date < selectedDate)
    .slice(0, 8);

  function updateEntry(nextEntry: WeeklyEntry) {
    setData((current) => ({
      ...current,
      weekly: { ...current.weekly, [weekStart]: nextEntry },
    }));
  }

  function updateList(
    key: "topPriorities" | "lowPriorities" | "followUps",
    index: number,
    value: string,
  ) {
    const currentList = getVisibleRows(entry[key]);
    const nextList = currentList.map((item, itemIndex) => (itemIndex === index ? value : item));

    updateEntry({
      ...entry,
      [key]: trimTrailingEmptyRows(nextList),
    });
  }

  return (
    <>
      <header className="view-header">
        <div>
          <h2>Weekly Plan</h2>
          <p className="week-start-line">{formatFriendlyDate(weekStart)} starts this planning week.</p>
        </div>
        <DatePicker value={selectedDate} onChange={setSelectedDate} />
      </header>

      <div className="panel-grid weekly-grid">
        <section className="weekly-left-column">
          <ProgressiveBucket
            accent="orange"
            label="Critical Goals"
            onChange={(index, value) => updateList("topPriorities", index, value)}
            rows={entry.topPriorities}
          />
          <ProgressiveBucket
            accent="lavender"
            label="Carry Forward"
            onChange={(index, value) => updateList("lowPriorities", index, value)}
            rows={entry.lowPriorities}
          />
          <ProgressiveBucket
            accent="green"
            label="Waiting On"
            onChange={(index, value) => updateList("followUps", index, value)}
            rows={entry.followUps}
          />
          <TaskDigest title="Critical This Week" tasks={criticalTasks} />
          <TaskDigest title="Waiting" tasks={waitingTasks} />
          <TaskDigest title="Carry Forward" tasks={carryForwardTasks} />
        </section>

        <section className="planner-panel weekly-days-panel">
          <div className="week-day-grid">
            {weekDays.map((dateKey) => {
              const dayEntry = data.daily[dateKey];
              const topTasks = dayEntry?.tasks.slice(0, 4) ?? [];
              return (
                <button
                  className={dateKey === selectedDate ? "week-day active" : "week-day"}
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                >
                  <header>
                    <span>{formatFriendlyDate(dateKey).split(",")[0]}</span>
                    <strong>{dateKey.slice(8)}</strong>
                  </header>
                  <div className="week-day-lines">
                    <small>{getDaySummary(topTasks)}</small>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="planner-panel weekly-reflection-panel">
          <h3>Notes</h3>
          <textarea
            className="text-area weekly-reflection"
            value={entry.notes}
            onChange={(event) => updateEntry({ ...entry, notes: event.target.value })}
            placeholder="Loose thoughts, reminders, or review notes."
          />
        </section>
      </div>
    </>
  );
}

interface ProgressiveBucketProps {
  accent: "orange" | "lavender" | "green";
  label: string;
  rows: string[];
  onChange: (index: number, value: string) => void;
}

interface TaskDigestProps {
  title: string;
  tasks: Array<DailyTask & { date: string }>;
}

function TaskDigest({ title, tasks }: TaskDigestProps) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="planner-panel weekly-task-digest">
      <h3>{title}</h3>
      <div className="digest-list">
        {tasks.map((task) => (
          <p key={`${task.date}-${task.id}`}>
            <span className={`digest-priority ${task.priority}`}>{task.priority}</span>
            <strong>{task.date.slice(5)}</strong>
            {task.title}
          </p>
        ))}
      </div>
    </section>
  );
}

function ProgressiveBucket({ accent, label, rows, onChange }: ProgressiveBucketProps) {
  const visibleRows = getVisibleRows(rows);

  return (
    <section className={`planner-panel progressive-bucket ${accent}`}>
      <h3>{label}</h3>
      <div className="progressive-rows">
        {visibleRows.map((row, index) => (
          <input
            className="progressive-input"
            key={index}
            onChange={(event) => onChange(index, event.target.value)}
            placeholder={index === 0 ? `Add ${label.toLowerCase()}` : "Next item"}
            value={row}
          />
        ))}
      </div>
    </section>
  );
}

function getVisibleRows(rows: string[]): string[] {
  const cleanRows = trimTrailingEmptyRows(rows);
  return [...cleanRows, ""];
}

function trimTrailingEmptyRows(rows: string[]): string[] {
  const nextRows = [...rows];
  while (nextRows.length > 0 && !nextRows[nextRows.length - 1].trim()) {
    nextRows.pop();
  }
  return nextRows;
}

function getDaySummary(tasks: DailyTask[]): string {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const p1 = tasks.filter((task) => task.priority === "P1").length;

  if (total === 0) {
    return "No tasks";
  }

  return `${done}/${total} done${p1 > 0 ? ` • ${p1} P1` : ""}`;
}

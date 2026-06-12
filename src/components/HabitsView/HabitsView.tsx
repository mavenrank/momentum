import { Plus, Trash2 } from "lucide-react";
import { Fragment } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DatePicker } from "../DatePicker/DatePicker";
import { getWeekDays, startOfWeekKey } from "../../lib/date";
import { createId } from "../../lib/plannerData";
import type { Habit, PlannerData } from "../../types/planner";
import "./HabitsView.css";

interface HabitsViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

const habitColors = ["#287c76", "#a45c40", "#5b6c91", "#8a6f3d", "#6b705c"];

export function HabitsView({ data, setData, selectedDate, setSelectedDate }: HabitsViewProps) {
  const weekDays = getWeekDays(startOfWeekKey(selectedDate));
  const activeHabits = data.habits.filter((habit) => !habit.archived);

  function addHabit(formData: FormData) {
    const name = String(formData.get("habit") ?? "").trim();
    if (!name) {
      return;
    }

    setData((current) => ({
      ...current,
      habits: [
        ...current.habits,
        {
          id: createId(),
          name,
          color: habitColors[current.habits.length % habitColors.length],
          createdAt: selectedDate,
          archived: false,
        },
      ],
    }));
  }

  function archiveHabit(habitId: string) {
    setData((current) => ({
      ...current,
      habits: current.habits.map((habit) =>
        habit.id === habitId ? { ...habit, archived: true } : habit,
      ),
    }));
  }

  function isDone(habit: Habit, date: string) {
    return data.habitLogs.some((log) => log.habitId === habit.id && log.date === date && log.done);
  }

  function toggleHabit(habit: Habit, date: string) {
    setData((current) => {
      const exists = current.habitLogs.some(
        (log) => log.habitId === habit.id && log.date === date,
      );

      return {
        ...current,
        habitLogs: exists
          ? current.habitLogs.map((log) =>
              log.habitId === habit.id && log.date === date ? { ...log, done: !log.done } : log,
            )
          : [...current.habitLogs, { habitId: habit.id, date, done: true }],
      };
    });
  }

  return (
    <>
      <header className="view-header">
        <div>
          <h2>Habits</h2>
        </div>
        <DatePicker value={selectedDate} onChange={setSelectedDate} />
      </header>

      <div className="panel-grid habit-grid">
        <section className="planner-panel add-habit-panel">
          <h3>New Habit</h3>
          <form
            className="add-habit-form"
            onSubmit={(event) => {
              event.preventDefault();
              addHabit(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <input className="text-input" name="habit" placeholder="Habit name" />
            <button className="primary-button" type="submit">
              <Plus size={17} />
              Add
            </button>
          </form>
        </section>

        <section className="planner-panel habit-board-panel">
          <h3>Weekly Tracker</h3>
          <div className="habit-board">
            <div className="habit-board-heading" />
            {weekDays.map((date) => (
              <div className="habit-day-heading" key={date}>
                <span>{date.slice(5)}</span>
              </div>
            ))}

            {activeHabits.map((habit) => (
              <Fragment key={habit.id}>
                <div className="habit-name">
                  <span style={{ background: habit.color }} />
                  {habit.name}
                  <button
                    className="icon-button habit-remove"
                    type="button"
                    title="Archive habit"
                    onClick={() => archiveHabit(habit.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {weekDays.map((date) => (
                  <button
                    className={isDone(habit, date) ? "habit-check done" : "habit-check"}
                    key={`${habit.id}-${date}`}
                    type="button"
                    onClick={() => toggleHabit(habit, date)}
                    title={`${habit.name} on ${date}`}
                  >
                    {isDone(habit, date) ? "✓" : ""}
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
          {activeHabits.length === 0 ? <p className="empty-state">No active habits yet.</p> : null}
        </section>
      </div>
    </>
  );
}

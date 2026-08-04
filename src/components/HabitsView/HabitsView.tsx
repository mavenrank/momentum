import { Fragment } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addDays, formatDayHeader, formatWeekRange, getWeekDays, startOfWeekKey, toDateKey } from "@/lib/date";
import { createId } from "@/lib/plannerData";
import { cn } from "@/lib/utils";
import type { Habit, PlannerData } from "@/types/planner";

interface HabitsViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

const habitColors = ["#287c76", "#a45c40", "#5b6c91", "#8a6f3d", "#6b705c"];

export function HabitsView({ data, setData, selectedDate, setSelectedDate }: HabitsViewProps) {
  const weekStart = startOfWeekKey(selectedDate);
  const weekDays = getWeekDays(weekStart);
  const activeHabits = data.habits.filter((habit) => !habit.archived);
  const today = toDateKey(new Date());

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
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Habits</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatWeekRange(weekStart)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            title="Previous week"
            onClick={() => setSelectedDate(addDays(selectedDate, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(today)}>
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Next week"
            onClick={() => setSelectedDate(addDays(selectedDate, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>New habit</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addHabit(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <Input name="habit" placeholder="Habit name" className="max-w-sm" />
            <Button type="submit">
              <Plus className="size-4" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle>Weekly tracker</CardTitle>
          <Badge variant="muted">{activeHabits.length} active</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {activeHabits.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No active habits yet.
            </p>
          ) : (
            <div
              className="grid min-w-[34rem] items-center gap-1"
              style={{ gridTemplateColumns: "minmax(9rem, 1fr) repeat(7, minmax(3rem, auto))" }}
            >
              <div />
              {weekDays.map((date) => (
                <div
                  key={date}
                  className={cn(
                    "pb-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    date === today && "text-primary",
                  )}
                >
                  {formatDayHeader(date)}
                </div>
              ))}

              {activeHabits.map((habit) => (
                <Fragment key={habit.id}>
                  <div className="group flex items-center gap-2 py-1 pr-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: habit.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{habit.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Archive habit"
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => archiveHabit(habit.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  {weekDays.map((date) => (
                    <div key={`${habit.id}-${date}`} className="flex justify-center py-1">
                      <Checkbox
                        checked={isDone(habit, date)}
                        onCheckedChange={() => toggleHabit(habit, date)}
                        aria-label={`${habit.name} on ${date}`}
                      />
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import * as React from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RollingText } from "@/components/ui/rolling-text";
import { TaskDetailDialog } from "../PlannerView/TaskDetailDialog";
import { useCalendarScroller } from "./useCalendarScroller";
import { getAreaColor } from "@/lib/areas";
import {
  addDays,
  formatMonth,
  formatTimeOfDay,
  fromDateKey,
  isSameMonth,
  startOfMonthKey,
  toDateKey,
} from "@/lib/date";
import { allTasks, deleteTask, updateTask } from "@/lib/plannerData";
import { cn } from "@/lib/utils";
import { compareByTiming } from "@/types/planner";
import type { DailyTask, PlannerData } from "@/types/planner";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/**
 * Rows are sized off the viewport alone and never change as you move between
 * months — sizing them per-month meant the grid reflowed a beat after every
 * snap, which read as jank.
 *
 * Months need 4, 5 or 6 rows. The divisor sits deliberately between 5 and 6:
 * a 5-row month shows about half a row of the next one, and a 6-row month hides
 * about half a row. Nothing is ever more than one row away from fitting.
 */
const ROW_DIVISOR = 5.5;
/** Rows stay legible between these bounds however tall the window is. */
const MIN_ROW_HEIGHT = 88;
const MAX_ROW_HEIGHT = 190;
/** Roughly how tall a task chip is, used to decide how many a cell can show. */
const CHIP_HEIGHT = 15;
/** Height taken by the date number above the chips. */
const CELL_HEADER_HEIGHT = 32;

interface CalendarViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onOpenDay: (date: string) => void;
}

interface DayCellProps {
  day: string;
  activeMonth: string;
  tasks: DailyTask[];
  areas: PlannerData["areas"];
  today: string;
  selectedDate: string;
  maxChips: number;
  onOpenDay: (date: string) => void;
  onOpenTask: (taskId: string) => void;
}

const DayCell = React.memo(function DayCell({
  day,
  activeMonth,
  tasks,
  areas,
  today,
  selectedDate,
  maxChips,
  onOpenDay,
  onOpenTask,
}: DayCellProps) {
  const date = fromDateKey(day);
  const dayOfMonth = date.getDate();
  const inActiveMonth = isSameMonth(day, activeMonth);
  const isToday = day === today;
  const isSelected = day === selectedDate;
  // The 1st carries its month name, the way a paper calendar marks the turn.
  const isMonthStart = dayOfMonth === 1;

  return (
    <div
      className={cn(
        "group flex min-w-0 flex-col gap-0.5 border-b border-r p-1 transition-colors duration-200",
        inActiveMonth ? "bg-background" : "bg-muted/30",
        isSelected && "bg-accent/40",
        // A heavier top edge marks where a new month begins.
        isMonthStart && "border-t-2 border-t-foreground/25",
      )}
    >
      <button
        type="button"
        onClick={() => onOpenDay(day)}
        title={`Open ${day}`}
        className="flex shrink-0 items-center gap-1 self-start rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "grid size-6 place-items-center rounded-full text-xs tabular-nums transition-colors",
            inActiveMonth ? "text-foreground" : "text-muted-foreground/45",
            isToday && "bg-primary font-semibold text-primary-foreground",
            !isToday && "group-hover:bg-accent",
          )}
        >
          {dayOfMonth}
        </span>
        {isMonthStart ? (
          <span
            className={cn(
              "text-[0.6875rem] font-semibold uppercase tracking-wide",
              inActiveMonth ? "text-foreground" : "text-muted-foreground/60",
            )}
          >
            {formatMonth(day).split(" ")[0].slice(0, 3)}
          </span>
        ) : null}
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden">
        {tasks.slice(0, maxChips).map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onOpenTask(task.id)}
            title={[task.title, task.summary].filter(Boolean).join(" — ")}
            className={cn(
              "flex w-full min-w-0 items-center gap-1 rounded-[3px] px-1 py-px text-left text-xs leading-tight transition-colors hover:bg-accent",
              task.status === "done" && "line-through opacity-50",
              !inActiveMonth && "opacity-70",
            )}
          >
            {/* An all-day task reads as a filled bar; a timed one keeps the dot
                and shows when it starts. */}
            {task.allDay ? (
              <span
                aria-hidden
                className="h-2.5 w-1 shrink-0 rounded-sm"
                style={{ backgroundColor: getAreaColor(areas, task.area) }}
              />
            ) : (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: getAreaColor(areas, task.area) }}
              />
            )}
            <span className="min-w-0 flex-1 truncate">{task.title}</span>
            {task.timeOfDay ? (
              <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                {formatTimeOfDay(task.timeOfDay).split("–")[0]}
              </span>
            ) : null}
          </button>
        ))}

        {tasks.length > maxChips ? (
          <button
            type="button"
            onClick={() => onOpenDay(day)}
            className="px-1 text-left text-[0.6875rem] text-muted-foreground hover:text-foreground"
          >
            +{tasks.length - maxChips} more
          </button>
        ) : null}
      </div>
    </div>
  );
});

export function CalendarView({
  data,
  setData,
  selectedDate,
  setSelectedDate,
  onOpenDay,
}: CalendarViewProps) {
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  // Depends only on the window, so it changes on resize and at no other time.
  const rowHeight = React.useMemo(() => {
    if (viewportHeight <= 0) {
      return 120;
    }
    return Math.round(
      Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, viewportHeight / ROW_DIVISOR)),
    );
  }, [viewportHeight]);

  const scroller = useCalendarScroller(selectedDate, rowHeight);
  const today = toDateKey(new Date());

  // Track the scroll container's height so the rows can follow window resizes.
  React.useEffect(() => {
    const container = scroller.scrollRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(container);
    setViewportHeight(container.clientHeight);

    return () => observer.disconnect();
  }, [scroller.scrollRef]);

  // Taller rows can afford to list more of the day's tasks.
  const maxChips = Math.max(
    1,
    Math.floor((rowHeight - CELL_HEADER_HEIGHT) / CHIP_HEIGHT),
  );

  const tasks = React.useMemo(() => allTasks(data), [data]);

  const tasksByDay = React.useMemo(() => {
    const map = new Map<string, DailyTask[]>();
    for (const task of tasks) {
      if (!task.scheduledDate) {
        continue;
      }
      const bucket = map.get(task.scheduledDate);
      if (bucket) {
        bucket.push(task);
      } else {
        map.set(task.scheduledDate, [task]);
      }
    }
    // All-day first, then timed in clock order, so a day reads like a plan.
    for (const bucket of map.values()) {
      bucket.sort(compareByTiming);
    }
    return map;
  }, [tasks]);

  const visibleWeeks = scroller.weeks.slice(scroller.firstVisible, scroller.lastVisible + 1);
  const activeYear = fromDateKey(scroller.activeMonth).getFullYear();

  // Both labels roll the same way, so a year change reads as part of the same
  // movement as the month that caused it.
  const previousMonth = React.useRef(scroller.activeMonth);
  const rollDirection = scroller.activeMonth >= previousMonth.current ? "up" : "down";
  React.useEffect(() => {
    previousMonth.current = scroller.activeMonth;
  }, [scroller.activeMonth]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Month on the left, year on the right, floating over the grid. Both roll
          in the direction of travel as the active month changes. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-baseline justify-between px-3 py-1.5">
        <span className="rounded-md bg-background/75 px-2 py-0.5 backdrop-blur-md">
          <RollingText
            value={formatMonth(scroller.activeMonth).split(" ")[0]}
            direction={rollDirection}
            className="text-2xl font-semibold tracking-tight"
          />
        </span>
        <span className="rounded-md bg-background/75 px-2 py-0.5 backdrop-blur-md">
          <RollingText
            value={String(activeYear)}
            direction={rollDirection}
            className="text-2xl font-light tabular-nums text-muted-foreground"
          />
        </span>
      </div>

      <div className="pointer-events-none absolute right-3 top-14 z-20 flex flex-col items-end gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          title="Previous month"
          className="pointer-events-auto bg-background/85 backdrop-blur"
          onClick={() => scroller.stepMonth(-1)}
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          title="Next month"
          className="pointer-events-auto bg-background/85 backdrop-blur"
          onClick={() => scroller.stepMonth(1)}
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          title="Jump to today"
          className="pointer-events-auto mt-0.5 h-7 bg-background/85 px-2 text-xs backdrop-blur"
          onClick={() => {
            setSelectedDate(today);
            scroller.jumpToMonth(startOfMonthKey(today));
          }}
        >
          Today
        </Button>
      </div>

      <div className="z-10 grid shrink-0 grid-cols-7 border-b bg-background pt-10">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* One continuous stream of week rows: every date appears exactly once, so
          there are no repeated rows or gaps at month boundaries. */}
      <div ref={scroller.scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div style={{ height: scroller.topSpacer }} aria-hidden />

        {visibleWeeks.map((weekStart) => (
          <div
            key={weekStart}
            className="grid grid-cols-7 border-l"
            style={{ height: rowHeight }}
          >
            {Array.from({ length: 7 }, (_, offset) => {
              const day = addDays(weekStart, offset);
              return (
                <DayCell
                  key={day}
                  day={day}
                  activeMonth={scroller.activeMonth}
                  tasks={tasksByDay.get(day) ?? []}
                  areas={data.areas}
                  today={today}
                  selectedDate={selectedDate}
                  maxChips={maxChips}
                  onOpenDay={onOpenDay}
                  onOpenTask={setDetailTaskId}
                />
              );
            })}
          </div>
        ))}

        <div style={{ height: scroller.bottomSpacer }} aria-hidden />
      </div>

      <TaskDetailDialog
        task={tasks.find((task) => task.id === detailTaskId) ?? null}
        areas={data.areas}
        allTasks={tasks}
        onClose={() => setDetailTaskId(null)}
        onSave={(taskId, patch) => setData((current) => updateTask(current, taskId, patch))}
        onDelete={(taskId) => setData((current) => deleteTask(current, taskId))}
      />
    </div>
  );
}

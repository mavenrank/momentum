import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RollingText } from "@/components/ui/rolling-text";
import { useCalendarScroller } from "./useCalendarScroller";
import { getAreaColor } from "@/lib/areas";
import {
  addDays,
  addMonths,
  formatMonth,
  formatTimeOfDay,
  fromDateKey,
  getMonthPageSlots,
  getMonthWeekCount,
  isSameMonth,
  startOfMonthKey,
  toDateKey,
} from "@/lib/date";
import { allTasks } from "@/lib/plannerData";
import { usePreferences } from "@/lib/preferences";
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
  onOpenTask: (taskId: string) => void;
  data: PlannerData;
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
  fitHeight?: boolean;
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
  fitHeight,
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
        fitHeight && "min-h-0",
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

function VerticalCalendar({
  onOpenTask,
  data,
  selectedDate,
  setSelectedDate,
  onOpenDay,
}: CalendarViewProps) {
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
    <div className="flex h-full min-h-0 flex-col p-3 sm:p-4">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-2 pb-3 pt-1 sm:px-3">
        <h2 className="flex min-w-0 items-baseline gap-2 overflow-hidden">
          <RollingText
            value={formatMonth(scroller.activeMonth).split(" ")[0]}
            direction={rollDirection}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          />
          <RollingText
            value={String(activeYear)}
            direction={rollDirection}
            className="text-lg font-light tabular-nums text-muted-foreground sm:text-xl"
          />
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            title="Previous month"
            aria-label="Previous month"
            onClick={() => scroller.stepMonth(-1)}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Jump to today"
            onClick={() => {
              setSelectedDate(today);
              scroller.jumpToMonth(startOfMonthKey(today));
            }}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            title="Next month"
            aria-label="Next month"
            onClick={() => scroller.stepMonth(1)}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-7 border-b bg-background">
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
                  onOpenTask={onOpenTask}
                />
              );
            })}
          </div>
        ))}

        <div style={{ height: scroller.bottomSpacer }} aria-hidden />
      </div>

    </div>
  );
}

/** A month-per-page alternative to the continuous week stream. */
function HorizontalCalendar({ data, selectedDate, setSelectedDate, onOpenDay, onOpenTask }: CalendarViewProps) {
  const today = toDateKey(new Date());
  const [activeMonth, setActiveMonth] = React.useState(() => startOfMonthKey(selectedDate));
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 });
  const trackRef = React.useRef<HTMLDivElement>(null);
  const settleTimer = React.useRef<number | null>(null);
  const pendingSlide = React.useRef<{ from: number; duration: number } | null>(null);
  const slideFrame = React.useRef<number | null>(null);
  const buttonAnimating = React.useRef(false);
  const committingMonth = React.useRef(false);
  const pressBurst = React.useRef({ lastTime: 0, count: 0 });
  const wheelBurst = React.useRef({ lastTime: 0, direction: 0, count: 0, carry: 0 });
  const months = React.useMemo(
    () => [addMonths(activeMonth, -1), activeMonth, addMonths(activeMonth, 1)],
    [activeMonth],
  );

  const tasksByDay = React.useMemo(() => {
    const groups = new Map<string, DailyTask[]>();
    for (const task of allTasks(data)) {
      if (!task.scheduledDate) continue;
      const bucket = groups.get(task.scheduledDate) ?? [];
      bucket.push(task);
      groups.set(task.scheduledDate, bucket);
    }
    for (const bucket of groups.values()) bucket.sort(compareByTiming);
    return groups;
  }, [data]);

  React.useLayoutEffect(() => {
    const track = trackRef.current;
    if (track && viewport.width > 0) {
      if (slideFrame.current !== null) window.cancelAnimationFrame(slideFrame.current);
      const slide = pendingSlide.current;
      if (slide && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // The new three-page range contains the former month beside the new
        // center. A timed frame animation lets a new input interrupt the slide
        // and lets a wheel burst shorten it without browser scroll delays.
        track.style.scrollSnapType = "none";
        const from = slide.from;
        track.scrollLeft = from;
        const startedAt = performance.now();
        const animate = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / slide.duration);
          const eased = 1 - (1 - progress) ** 3;
          track.scrollLeft = from + (viewport.width - from) * eased;
          if (progress < 1) {
            slideFrame.current = window.requestAnimationFrame(animate);
          } else {
            track.scrollLeft = viewport.width;
            track.style.scrollSnapType = "";
            slideFrame.current = null;
            buttonAnimating.current = false;
          }
        };
        slideFrame.current = window.requestAnimationFrame(animate);
      } else {
        track.style.scrollSnapType = "";
        track.scrollLeft = viewport.width;
        buttonAnimating.current = false;
      }
      pendingSlide.current = null;
    }
    committingMonth.current = false;
  }, [activeMonth, viewport.width]);

  React.useEffect(() => () => {
    if (slideFrame.current !== null) window.cancelAnimationFrame(slideFrame.current);
  }, []);

  const stepMonth = React.useCallback((delta: number, duration = 170) => {
    if (!delta) return;
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    const width = viewport.width;
    const currentOffset = trackRef.current?.scrollLeft ?? width;
    // Shift the in-flight visual position into the next three-page range.
    // This avoids jumping back to a page edge on rapid repeated input.
    const from = Math.max(0, Math.min(width * 2, currentOffset - Math.sign(delta) * width));
    pendingSlide.current = { from, duration };
    buttonAnimating.current = true;
    // Each click updates the destination immediately. The in-flight slide is
    // interrupted and replaced by a slide to the newest destination.
    setActiveMonth((current) => addMonths(current, delta));
  }, [viewport.width]);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => {
      const width = track.clientWidth;
      const height = track.clientHeight;
      setViewport((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(track);
    setViewport({ width: track.clientWidth, height: track.clientHeight });
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const settle = () => {
      if (viewport.width === 0) return;
      if (buttonAnimating.current) return;
      const page = Math.max(0, Math.min(2, Math.round(track.scrollLeft / viewport.width)));
      // Keep the same three pages mounted throughout the swipe. Replace them
      // only after the viewport has snapped onto a complete month.
      if (Math.abs(track.scrollLeft - page * viewport.width) > 4) return;
      if (page !== 1) {
        if (!committingMonth.current) {
          committingMonth.current = true;
          setActiveMonth((current) => addMonths(current, page - 1));
        }
      }
    };
    const onScroll = () => {
      // Modern Chromium/WebView2 fires scrollend after scroll snapping and
      // touchpad inertia finish. Only older engines need an idle fallback.
      if ("onscrollend" in track) return;
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 140);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? track.clientHeight : 1);
      const direction = Math.sign(pixels);
      if (!direction) return;
      const now = performance.now();
      const burst = wheelBurst.current;
      if (now - burst.lastTime > 220 || burst.direction !== direction) {
        burst.carry = 0;
        burst.count = 0;
      }
      burst.lastTime = now;
      burst.direction = direction;
      burst.count += 1;
      // A mouse-wheel notch is one month. Smaller trackpad deltas combine
      // until they represent a deliberate month step.
      if (Math.abs(pixels) >= 80) {
        burst.carry = 0;
      } else {
        burst.carry += pixels;
        if (Math.abs(burst.carry) < 80) return;
        burst.carry -= direction * 80;
      }
      stepMonth(direction, Math.max(65, 170 - (burst.count - 1) * 18));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", settle);
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", settle);
      track.removeEventListener("wheel", onWheel);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, [viewport.width, stepMonth]);

  const jumpToToday = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (slideFrame.current !== null) window.cancelAnimationFrame(slideFrame.current);
    slideFrame.current = null;
    pendingSlide.current = null;
    buttonAnimating.current = false;
    if (trackRef.current) trackRef.current.style.scrollSnapType = "";
    setSelectedDate(today);
    setActiveMonth(startOfMonthKey(today));
    if (trackRef.current && viewport.width > 0) trackRef.current.scrollLeft = viewport.width;
  };

  const stepWithButton = (delta: number) => {
    const now = performance.now();
    const burst = pressBurst.current;
    burst.count = now - burst.lastTime < 260 ? burst.count + 1 : 0;
    burst.lastTime = now;
    stepMonth(delta, Math.max(85, 170 - burst.count * 25));
  };

  const pageWidth = viewport.width || "100%";
  const previousMonth = React.useRef(activeMonth);
  const rollDirection = activeMonth >= previousMonth.current ? "left" : "right";
  React.useEffect(() => {
    previousMonth.current = activeMonth;
  }, [activeMonth]);

  return (
    <div className="flex h-full min-h-0 flex-col p-3 sm:p-4">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-2 pb-3 pt-1 sm:px-3">
        <h2 className="min-w-0 overflow-hidden"><RollingText value={formatMonth(activeMonth)} direction={rollDirection} className="text-xl font-semibold tracking-tight sm:text-2xl" /></h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="icon-sm" title="Previous month" aria-label="Previous month" onClick={() => stepWithButton(-1)}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" title="Jump to today" onClick={jumpToToday}>Today</Button>
          <Button variant="outline" size="icon-sm" title="Next month" aria-label="Next month" onClick={() => stepWithButton(1)}><ChevronRight className="size-4" /></Button>
        </div>
      </header>
      <div className="grid shrink-0 grid-cols-7 border-b bg-background">
        {WEEKDAY_LABELS.map((label) => <div key={label} className="py-1 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>)}
      </div>
      <div ref={trackRef} aria-label="Calendar months" className="flex w-full min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {months.map((month) => {
          const pageSize = { width: pageWidth, minWidth: pageWidth, maxWidth: pageWidth };
          const weekCount = getMonthWeekCount(month);
          const maxChips = Math.max(1, Math.floor(((viewport.height || 600) / weekCount - CELL_HEADER_HEIGHT) / CHIP_HEIGHT));
          return (
            <div
              key={month}
              aria-label={formatMonth(month)}
              className="grid h-full min-w-0 shrink-0 snap-start border-l"
              style={{ ...pageSize, gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
            >
              {getMonthPageSlots(month).map((day) => (
                <DayCell key={day} day={day} activeMonth={month} tasks={tasksByDay.get(day) ?? []} areas={data.areas} today={today} selectedDate={selectedDate} maxChips={maxChips} fitHeight onOpenDay={onOpenDay} onOpenTask={onOpenTask} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarView(props: CalendarViewProps) {
  const { calendarNavigation } = usePreferences();
  return calendarNavigation === "horizontal"
    ? <HorizontalCalendar {...props} />
    : <VerticalCalendar {...props} />;
}

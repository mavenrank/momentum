import * as React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getAreaColor } from "@/lib/areas";
import {
  formatDayHeader,
  formatTimeOfDay,
  minutesToTime,
  parseTimeRange,
  snapMinutes,
  toDateKey,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Area, DailyTask } from "@/types/planner";

/* ------------------------------------------------------------- geometry -- */

/** Pixels per hour. Everything else on the grid is derived from this. */
export const HOUR_HEIGHT = 64;
/** The grid snaps to quarter hours — fine enough to be useful, coarse enough to hit. */
export const SNAP_MINUTES = 15;
/** Shortest block the grid will draw or a resize will produce. */
const MIN_BLOCK_MINUTES = 15;
/** The window always covers at least this, and grows to fit anything outside it. */
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 23;
/** Width of the hour-label gutter. */
const GUTTER = "w-16";
/**
 * Half a line of breathing room above the first hour label and below the last,
 * so neither is sliced in half by the edge of the scroll box. Padding sits on
 * the scroll container rather than the lanes, so it never enters the drop maths.
 */
const EDGE_PADDING = "pb-4 pt-2";

export interface TimeBlockColumn {
  key: string;
  label: string;
  date: string;
}

/** The window of the day the grid draws, in minutes past midnight. */
export interface DayWindow {
  start: number;
  end: number;
}

/**
 * Widens the default window so nothing scheduled sits off the top or bottom of
 * the grid — an early flight or a late call pulls the day open rather than
 * disappearing.
 */
export function computeDayWindow(tasks: DailyTask[]): DayWindow {
  let start = DEFAULT_START_HOUR * 60;
  let end = DEFAULT_END_HOUR * 60;

  for (const task of tasks) {
    const range = parseTimeRange(task.timeOfDay);
    if (!range) {
      continue;
    }
    start = Math.min(start, Math.floor(range.start / 60) * 60);
    end = Math.max(end, Math.ceil(range.end / 60) * 60);
  }

  return { start, end: Math.max(end, start + 60) };
}

function minutesToOffset(minutes: number, window: DayWindow): number {
  return ((minutes - window.start) / 60) * HOUR_HEIGHT;
}

/** Turns a pointer offset inside a lane back into a snapped clock time. */
export function offsetToMinutes(offset: number, window: DayWindow): number {
  const raw = window.start + (offset / HOUR_HEIGHT) * 60;
  return Math.max(
    window.start,
    Math.min(window.end - MIN_BLOCK_MINUTES, snapMinutes(raw, SNAP_MINUTES)),
  );
}

/* -------------------------------------------------------------- packing -- */

interface PackedBlock {
  task: DailyTask;
  start: number;
  end: number;
  /** Which of the side-by-side tracks this block sits in. */
  track: number;
  /** How many tracks the overlapping cluster needed. */
  trackCount: number;
}

/**
 * Lays overlapping blocks out side by side. Blocks are grouped into clusters
 * that share any overlap, and each cluster is split into as many tracks as its
 * busiest moment needs — so two tasks at 3pm each take half the lane, and an
 * unrelated 5pm task still gets the full width.
 */
function packBlocks(tasks: DailyTask[]): PackedBlock[] {
  const ranges = tasks
    .map((task) => {
      const range = parseTimeRange(task.timeOfDay);
      return range ? { task, start: range.start, end: range.end } : null;
    })
    .filter((entry): entry is { task: DailyTask; start: number; end: number } => entry !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const packed: PackedBlock[] = [];
  let cluster: PackedBlock[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const trackCount = cluster.reduce((max, block) => Math.max(max, block.track + 1), 0);
    for (const block of cluster) {
      packed.push({ ...block, trackCount });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const entry of ranges) {
    if (entry.start >= clusterEnd && cluster.length > 0) {
      flush();
    }

    // The first free track is the one whose last block has already finished.
    const trackEnds: number[] = [];
    for (const block of cluster) {
      trackEnds[block.track] = Math.max(trackEnds[block.track] ?? 0, block.end);
    }
    let track = trackEnds.findIndex((end) => end <= entry.start);
    if (track === -1) {
      track = trackEnds.length === 0 ? 0 : trackEnds.length;
    }

    cluster.push({ ...entry, track, trackCount: 1 });
    clusterEnd = Math.max(clusterEnd, entry.end);
  }
  if (cluster.length > 0) {
    flush();
  }

  return packed;
}

/* ---------------------------------------------------------------- block -- */

/**
 * The grab area is deliberately taller than the grip it draws: the target is
 * comfortable to hit, while what you see is a quiet 24px pill that only firms
 * up under the pointer.
 */
function ResizeHandle({
  edge,
  active,
  onPointerDown,
}: {
  edge: "start" | "end";
  active: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={edge === "start" ? "Change the start time" : "Change the end time"}
      onPointerDown={onPointerDown}
      className={cn(
        "group/grip absolute inset-x-0 z-30 flex h-3 cursor-ns-resize items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100",
        edge === "start" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2",
        active && "opacity-100",
      )}
    >
      <span
        className={cn(
          "h-1 w-6 rounded-full bg-muted-foreground/45 ring-1 ring-background/80 transition-all duration-150",
          "group-hover/grip:w-9 group-hover/grip:bg-foreground/70",
          active && "w-9 bg-foreground/70",
        )}
      />
    </div>
  );
}

interface TimeBlockProps {
  block: PackedBlock;
  areas: Area[];
  window: DayWindow;
  selected: boolean;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onResize: (taskId: string, start: number, end: number) => void;
}

function TimeBlock({
  block,
  areas,
  window: dayWindow,
  selected,
  onSelect,
  onOpenDetail,
  onToggleDone,
  onContextMenu,
  onResize,
}: TimeBlockProps) {
  const { task } = block;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  // While a handle is held, the block follows the pointer locally; the change is
  // only written back on release so the store isn't touched every frame.
  const [preview, setPreview] = React.useState<{ start: number; end: number } | null>(null);

  const start = preview?.start ?? block.start;
  const end = preview?.end ?? block.end;
  const color = getAreaColor(areas, task.area);
  const done = task.status === "done";

  function beginResize(event: React.PointerEvent, edge: "start" | "end") {
    event.preventDefault();
    // Without this the block's own drag sensor would claim the gesture.
    event.stopPropagation();

    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const originY = event.clientY;
    let next = { start: block.start, end: block.end };

    function onMove(moveEvent: PointerEvent) {
      const deltaMinutes = ((moveEvent.clientY - originY) / HOUR_HEIGHT) * 60;

      if (edge === "end") {
        const raw = snapMinutes(block.end + deltaMinutes, SNAP_MINUTES);
        next = {
          start: block.start,
          end: Math.min(dayWindow.end, Math.max(block.start + MIN_BLOCK_MINUTES, raw)),
        };
      } else {
        const raw = snapMinutes(block.start + deltaMinutes, SNAP_MINUTES);
        next = {
          start: Math.max(dayWindow.start, Math.min(block.end - MIN_BLOCK_MINUTES, raw)),
          end: block.end,
        };
      }
      setPreview(next);
    }

    function onUp() {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setPreview(null);
      if (next.start !== block.start || next.end !== block.end) {
        onResize(task.id, next.start, next.end);
      }
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  const height = Math.max(18, ((end - start) / 60) * HOUR_HEIGHT);
  // A short block has no room for a second line.
  const dense = height < 44;

  return (
    <div
      ref={setNodeRef}
      style={{
        top: minutesToOffset(start, dayWindow),
        height,
        left: `${(block.track / block.trackCount) * 100}%`,
        width: `${(1 / block.trackCount) * 100}%`,
      }}
      className={cn(
        "group absolute z-10 px-px",
        isDragging && "opacity-40",
        preview && "z-20",
      )}
    >
      <div
        // dnd-kit's attributes come first so the roles below describe the block
        // as it reads to the user rather than as a bare drag handle.
        {...attributes}
        {...listeners}
        role="listitem"
        tabIndex={0}
        aria-selected={selected}
        data-task-id={task.id}
        title={`${task.title} — ${formatTimeOfDay(`${minutesToTime(start)}-${minutesToTime(end)}`)}`}
        onFocus={() => onSelect(task.id)}
        onClick={() => onSelect(task.id)}
        onDoubleClick={() => onOpenDetail(task.id)}
        onContextMenu={(event) => onContextMenu(event, task.id)}
        className={cn(
          "relative flex h-full cursor-grab flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left shadow-sm transition-shadow active:cursor-grabbing focus:outline-none",
          selected ? "ring-2 ring-ring" : "hover:shadow-md",
          done && "opacity-55",
        )}
        style={{
          borderLeftColor: color,
          // Tinted with the area colour rather than filled with it, so text on
          // top stays readable in both themes.
          backgroundColor: `color-mix(in oklab, ${color} 18%, var(--card))`,
        }}
      >
        <div className="flex min-w-0 items-start gap-1">
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleDone(task.id);
            }}
            className={cn(
              "mt-px grid size-3.5 shrink-0 place-items-center rounded-full border-2 transition-colors",
              done ? "text-background" : "text-transparent hover:text-muted-foreground",
            )}
            style={{ borderColor: color, backgroundColor: done ? color : "transparent" }}
          >
            <Check className="size-2" strokeWidth={4} />
          </button>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-medium leading-tight",
              done && "line-through decoration-muted-foreground",
            )}
          >
            {task.title}
          </span>
        </div>

        {/* While an edge is being pulled the time is the whole point, so it is
            shown even on a block too short to normally carry it. */}
        {!dense || preview ? (
          <span
            className={cn(
              "mt-auto font-mono text-[0.6875rem] leading-none",
              preview ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {formatTimeOfDay(minutesToTime(start))}–{formatTimeOfDay(minutesToTime(end))}
          </span>
        ) : null}
      </div>

      {/* Handles sit above the body and swallow the gesture, so dragging an edge
          resizes instead of moving the block. The visible part is a small grip
          centred on the edge — a full-width bar read as a coloured stripe across
          the task rather than as something to pull. */}
      <ResizeHandle
        edge="start"
        active={Boolean(preview)}
        onPointerDown={(event) => beginResize(event, "start")}
      />
      <ResizeHandle
        edge="end"
        active={Boolean(preview)}
        onPointerDown={(event) => beginResize(event, "end")}
      />
    </div>
  );
}

/* --------------------------------------------------------------- strips -- */

function AllDayChip({
  task,
  areas,
  selected,
  onSelect,
  onOpenDetail,
  onContextMenu,
}: {
  task: DailyTask;
  areas: Area[];
  selected: boolean;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="listitem"
      tabIndex={0}
      aria-selected={selected}
      data-task-id={task.id}
      title={task.title}
      onFocus={() => onSelect(task.id)}
      onClick={() => onSelect(task.id)}
      onDoubleClick={() => onOpenDetail(task.id)}
      onContextMenu={(event) => onContextMenu(event, task.id)}
      className={cn(
        "flex cursor-grab items-center gap-1 truncate rounded border-l-2 bg-card px-1 py-0.5 text-[0.6875rem] shadow-sm active:cursor-grabbing",
        selected && "ring-2 ring-ring",
        isDragging && "opacity-40",
        task.status === "done" && "line-through opacity-55",
      )}
      style={{ borderLeftColor: getAreaColor(areas, task.area) }}
    >
      {task.title}
    </div>
  );
}

/* ----------------------------------------------------------------- lane -- */

interface DayLaneProps
  extends Omit<TimeBlockProps, "block" | "selected"> {
  date: string;
  tasks: DailyTask[];
  /** Live drop position while a task is being dragged over this lane. */
  preview: number | null;
  selectedTaskId: string | null;
}

function DayLane({
  date,
  tasks,
  areas,
  window: dayWindow,
  preview,
  selectedTaskId,
  onSelect,
  onOpenDetail,
  onToggleDone,
  onContextMenu,
  onResize,
}: DayLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${date}` });
  const blocks = React.useMemo(() => packBlocks(tasks), [tasks]);
  const hours = Math.round((dayWindow.end - dayWindow.start) / 60);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative min-w-0 flex-1 border-l transition-colors",
        isOver && "bg-accent/40",
      )}
      style={{ height: hours * HOUR_HEIGHT }}
    >
      {/* Hour rules, drawn as a repeating background so the lane stays cheap. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour))",
          ["--hour" as string]: `${HOUR_HEIGHT}px`,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), var(--border) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour))",
          ["--hour" as string]: `${HOUR_HEIGHT}px`,
        }}
      />

      {preview !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
          style={{ top: minutesToOffset(preview, dayWindow) }}
        >
          <span className="h-0.5 flex-1 bg-primary" />
          <span className="rounded-l bg-primary px-1 font-mono text-[0.6875rem] text-primary-foreground">
            {formatTimeOfDay(minutesToTime(preview))}
          </span>
        </div>
      ) : null}

      {blocks.map((block) => (
        <TimeBlock
          key={block.task.id}
          block={block}
          areas={areas}
          window={dayWindow}
          selected={selectedTaskId === block.task.id}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
          onToggleDone={onToggleDone}
          onContextMenu={onContextMenu}
          onResize={onResize}
        />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- grid -- */

interface TimeBlockGridProps {
  columns: TimeBlockColumn[];
  /** Every task; the grid picks out the ones scheduled on its columns. */
  tasks: DailyTask[];
  areas: Area[];
  /**
   * The stretch of clock the grid draws. Owned by the caller because the drop
   * maths has to agree with the pixels exactly — see `computeDayWindow`.
   */
  dayWindow: DayWindow;
  selectedTaskId: string | null;
  /** Date and snapped minute currently under the pointer, if any. */
  dropPreview: { date: string; minutes: number } | null;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onResize: (taskId: string, start: number, end: number) => void;
}

/**
 * The day as a calendar rather than a list. Same three days as the board, but
 * laid against the clock — so a task is placed by dragging it to when it will
 * actually happen, and how long it takes is the height of the block.
 */
export function TimeBlockGrid({
  columns,
  tasks,
  areas,
  dayWindow,
  selectedTaskId,
  dropPreview,
  onSelect,
  onOpenDetail,
  onToggleDone,
  onContextMenu,
  onResize,
}: TimeBlockGridProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [now, setNow] = React.useState(() => new Date());
  const today = toDateKey(now);

  const dates = React.useMemo(() => columns.map((column) => column.date), [columns]);
  const byDate = React.useMemo(() => {
    const map = new Map<string, DailyTask[]>();
    for (const date of dates) {
      map.set(
        date,
        tasks.filter((task) => task.scheduledDate === date),
      );
    }
    return map;
  }, [tasks, dates]);

  const hours = Math.round((dayWindow.end - dayWindow.start) / 60);

  // The clock hand only needs to move once a minute.
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Open on the working day rather than at 6am, but never past the point where
  // the rest of the day would be scrolled out of sight.
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const target = Math.max(0, minutesToOffset(8 * 60, dayWindow));
    container.scrollTop = Math.min(target, container.scrollHeight - container.clientHeight);
    // Only on mount: re-running would yank the view back while the user scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowVisible = nowMinutes >= dayWindow.start && nowMinutes <= dayWindow.end;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/20">
      <div className="relative z-10 flex shrink-0 border-b bg-background">
        <div className={cn(GUTTER, "shrink-0")} />
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(
              "min-w-0 flex-1 border-l px-2 py-1.5",
              column.date === today && "bg-muted/60",
            )}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {column.label}
              </span>
              <Badge variant="muted">{byDate.get(column.date)?.length ?? 0}</Badge>
            </div>
            <div className="truncate text-xs font-semibold">{formatDayHeader(column.date)}</div>
          </div>
        ))}
      </div>

      <AllDayStrip
        columns={columns}
        byDate={byDate}
        areas={areas}
        selectedTaskId={selectedTaskId}
        onSelect={onSelect}
        onOpenDetail={onOpenDetail}
        onContextMenu={onContextMenu}
      />

      <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto", EDGE_PADDING)}>
        {/* The clock body is the positioning context, not the scroll box — an
            overlay anchored to the scroll box would stay put as the day moves. */}
        <div className="relative flex" style={{ height: hours * HOUR_HEIGHT }}>
          <div className={cn(GUTTER, "relative shrink-0")}>
            {Array.from({ length: hours + 1 }, (_, index) => {
              const minutes = dayWindow.start + index * 60;
              return (
                <span
                  key={minutes}
                  className="absolute right-2 -translate-y-1/2 font-mono text-xs tabular-nums text-muted-foreground"
                  style={{ top: index * HOUR_HEIGHT }}
                >
                  {formatTimeOfDay(minutesToTime(Math.min(minutes, 23 * 60 + 59)))}
                </span>
              );
            })}
          </div>

          {columns.map((column) => (
            <DayLane
              key={column.key}
              date={column.date}
              tasks={(byDate.get(column.date) ?? []).filter(
                (task) => task.timeOfDay && !task.allDay,
              )}
              areas={areas}
              window={dayWindow}
              preview={dropPreview?.date === column.date ? dropPreview.minutes : null}
              selectedTaskId={selectedTaskId}
              onSelect={onSelect}
              onOpenDetail={onOpenDetail}
              onToggleDone={onToggleDone}
              onContextMenu={onContextMenu}
              onResize={onResize}
            />
          ))}

          {/* One line straight across the grid, so "now" is read against every
              column at once rather than only against today. */}
          {nowVisible ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
              style={{ top: minutesToOffset(nowMinutes, dayWindow) }}
            >
              <span className={cn(GUTTER, "shrink-0 pr-1 text-right")}>
                <span className="rounded bg-[var(--priority-must)] px-1 font-mono text-[0.6875rem] text-white">
                  {formatTimeOfDay(minutesToTime(nowMinutes))}
                </span>
              </span>
              <span className="h-px flex-1 bg-[var(--priority-must)]/70" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ all-day -- */

function AllDayStrip({
  columns,
  byDate,
  areas,
  selectedTaskId,
  onSelect,
  onOpenDetail,
  onContextMenu,
}: {
  columns: TimeBlockColumn[];
  byDate: Map<string, DailyTask[]>;
  areas: Area[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
}) {
  return (
    // Opaque, and casting a shadow over the clock: blocks pass underneath it as
    // the day scrolls, and a translucent strip made that read like a glitch.
    <div className="relative z-10 flex shrink-0 border-b bg-background shadow-[0_2px_4px_-2px_rgb(0_0_0/0.12)]">
      <div
        className={cn(
          GUTTER,
          "shrink-0 px-1 py-1 text-right text-[0.6875rem] uppercase leading-tight tracking-wide text-muted-foreground",
        )}
      >
        All day
      </div>
      {columns.map((column) => (
        <AllDayCell
          key={column.key}
          date={column.date}
          tasks={(byDate.get(column.date) ?? []).filter((task) => !task.timeOfDay || task.allDay)}
          areas={areas}
          selectedTaskId={selectedTaskId}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

function AllDayCell({
  date,
  tasks,
  areas,
  selectedTaskId,
  onSelect,
  onOpenDetail,
  onContextMenu,
}: {
  date: string;
  tasks: DailyTask[];
  areas: Area[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `allday:${date}` });

  return (
    <div
      ref={setNodeRef}
      role="list"
      className={cn(
        "flex max-h-16 min-h-8 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto border-l p-1 transition-colors",
        isOver && "bg-accent",
      )}
    >
      {tasks.map((task) => (
        <AllDayChip
          key={task.id}
          task={task}
          areas={areas}
          selected={selectedTaskId === task.id}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { InboxPanel, type InboxBucket } from "../InboxPanel";
import { PlannerHeader, STEPPER_LABEL_WIDTH } from "../PlannerHeader";
import { TaskCard } from "../TaskCard";
import { TaskContextMenu, useTaskContextMenu } from "../TaskContextMenu";
import type { TaskMenuActions } from "../TaskContextMenu";
import { FollowUpPrompt } from "../FollowUpPrompt";
import { computeDayWindow, TimeBlockGrid } from "../TimeBlockGrid";
import { blockTask, resolveTimeBlockDrop } from "../timeBlockDnd";
import {
  addDays,
  formatDayHeader,
  formatTimeRangeValue,
  formatWeekRange,
  getWeekDays,
  getWeekNumber,
  startOfWeekKey,
  toDateKey,
} from "@/lib/date";
import { ensureWeekly, poolTasks, unscheduledTasks } from "@/lib/plannerData";
import { cn } from "@/lib/utils";
import type { PlannerActions } from "@/hooks/usePlannerActions";
import type { DailyTask, PlannerData } from "@/types/planner";
import type { PlannerCommandExecutor } from "@/lib/application/commands";

interface WeekViewProps {
  onOpenTask: (taskId: string) => void;
  data: PlannerData;
  execute: PlannerCommandExecutor;
  actions: PlannerActions;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onOpenDay: (date: string) => void;
  /** The Today/Week switch, rendered inline with this view's own controls. */
  lensControl?: React.ReactNode;
  timeBlocking: boolean;
  onTimeBlockingChange: (on: boolean) => void;
}

/* ------------------------------------------------------------- dnd atoms -- */

/**
 * Everything a card needs to be interactive, passed as one object so the
 * columns and drop zones don't each grow a row of near-identical props.
 */
interface CardHandlers {
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onFollowUp: (task: DailyTask) => void;
  onReturnToPool: (taskId: string) => void;
}

function DraggableTask({
  task,
  areas,
  selectedTaskId,
  onSelect,
  onOpenDetail,
  onToggleDone,
  onContextMenu,
  onFollowUp,
  onReturnToPool,
}: CardHandlers & { task: DailyTask; areas: PlannerData["areas"] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      areas={areas}
      compact
      selected={selectedTaskId === task.id}
      onFocus={() => onSelect(task.id)}
      onClick={() => onSelect(task.id)}
      onDoubleClick={() => onOpenDetail(task.id)}
      onContextMenu={(event) => onContextMenu(event, task.id)}
      onToggleDone={() => onToggleDone(task.id)}
      onOpenTask={() => onOpenDetail(task.id)}
      onFollowUp={() => onFollowUp(task)}
      onReturnToPool={() => onReturnToPool(task.id)}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    />
  );
}

function DayColumn({
  date,
  tasks,
  areas,
  cards,
  onOpenDay,
  index,
}: {
  date: string;
  tasks: DailyTask[];
  areas: PlannerData["areas"];
  cards: CardHandlers;
  onOpenDay: (date: string) => void;
  index: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const isToday = date === toDateKey(new Date());

  return (
    // min-h-0 is what stops a busy day from growing the whole row: the column is
    // sized by the grid, and its list scrolls inside that. Without it the tallest
    // column set the height for all seven, so adding a summary to one task
    // resized the entire week.
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md border bg-muted/25 transition-colors",
        isOver && "border-ring bg-accent",
        isToday && "border-ring/50",
      )}
    >
      <button
        type="button"
        onClick={() => onOpenDay(date)}
        title={`Open ${formatDayHeader(date)} in the Today view`}
        className="flex shrink-0 items-center justify-between border-b px-2 py-1.5 text-left text-xs font-semibold hover:bg-accent/60"
      >
        <span className={cn(isToday && "text-primary")}>{formatDayHeader(date)}</span>
        <span className="flex items-center gap-1.5">
          {tasks.length > 0 ? <Badge variant="muted">{tasks.length}</Badge> : null}
          <span className="font-mono text-[0.6875rem] font-normal text-muted-foreground">
            ⌃⇧{index + 1}
          </span>
        </span>
      </button>

      <div role="list" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        {tasks.map((task) => (
          <DraggableTask key={task.id} task={task} areas={areas} {...cards} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ view -- */

export function WeekView({
  onOpenTask,
  data,
  execute,
  actions,
  selectedDate,
  setSelectedDate,
  onOpenDay,
  lensControl,
  timeBlocking,
  onTimeBlockingChange,
}: WeekViewProps) {
  const { toast } = useToast();
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [draggingTask, setDraggingTask] = React.useState<DailyTask | null>(null);
  const [slide, setSlide] = React.useState<"left" | "right" | null>(null);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [followUpFor, setFollowUpFor] = React.useState<DailyTask | null>(null);
  const [inboxBucket, setInboxBucket] = React.useState<InboxBucket>("pool");
  const [dropPreview, setDropPreview] = React.useState<{
    date: string;
    minutes: number;
  } | null>(null);
  const menu = useTaskContextMenu();

  const weekStart = startOfWeekKey(selectedDate);
  const weekDays = React.useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEnd = weekDays[6];

  const sensors = useSensors(
    // A small activation distance keeps click-to-select working.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const flatAllTasks = React.useMemo(
    () => Object.values(data.daily).flatMap((entry) => entry.tasks),
    [data.daily],
  );

  const tasksByDay = React.useMemo(
    () =>
      new Map(
        weekDays.map((day) => [day, flatAllTasks.filter((task) => task.scheduledDate === day)]),
      ),
    [flatAllTasks, weekDays],
  );

  const unscheduled = React.useMemo(
    // "Committed to this week" = planned, no day yet, created on or before this week's end.
    () => unscheduledTasks(data).filter((task) => task.createdAt.slice(0, 10) <= weekEnd),
    [data, weekEnd],
  );
  const pool = React.useMemo(() => {
    // Untriaged tasks plus anything left unfinished before this week started.
    const leftovers = flatAllTasks.filter(
      (task) =>
        task.status !== "done" &&
        task.scheduledDate !== undefined &&
        task.scheduledDate < weekStart,
    );
    return [...poolTasks(data), ...leftovers];
  }, [data, flatAllTasks, weekStart]);

  // The grid draws by date, so it wants exactly what is scheduled this week.
  const weekTasks = React.useMemo(
    () => flatAllTasks.filter((task) => task.scheduledDate && weekDays.includes(task.scheduledDate)),
    [flatAllTasks, weekDays],
  );
  const dayWindow = React.useMemo(() => computeDayWindow(weekTasks), [weekTasks]);

  const columns = React.useMemo(
    () => weekDays.map((day) => ({ key: day, label: formatDayHeader(day), date: day })),
    [weekDays],
  );

  function shiftWeek(direction: -1 | 1) {
    setSlide(direction === 1 ? "right" : "left");
    setSelectedDate(addDays(selectedDate, direction * 7));
    window.setTimeout(() => setSlide(null), 260);
  }

  function returnToPool(taskId: string) {
    actions.returnToPool(taskId);
    toast("Pulled back to the Pool.");
  }

  /* ----------------------------------------------------------------- dnd -- */

  function handleDragStart(event: DragStartEvent) {
    setDraggingTask(flatAllTasks.find((task) => task.id === event.active.id) ?? null);
  }

  function handleDragMove(event: DragMoveEvent) {
    const drop = resolveTimeBlockDrop(event, dayWindow);
    setDropPreview(drop?.kind === "lane" ? { date: drop.date, minutes: drop.minutes } : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const drop = resolveTimeBlockDrop(event, dayWindow);
    const taskId = String(event.active.id);
    setDraggingTask(null);
    setDropPreview(null);

    if (!drop) {
      return;
    }

    switch (drop.kind) {
      case "unscheduled":
        actions.moveToDate(taskId, undefined);
        break;
      case "pool":
        returnToPool(taskId);
        break;
      case "day":
        actions.moveToDate(taskId, drop.date);
        break;
      case "allDay":
        actions.moveToDate(taskId, drop.date);
        actions.patchTask(taskId, { timeOfDay: undefined });
        break;
      case "lane":
        blockTask(actions, flatAllTasks, taskId, drop.date, drop.minutes);
        break;
    }
  }

  // Ctrl+Shift+1–7 assigns the selected task to a weekday.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.shiftKey || !selectedTaskId) {
        return;
      }

      // event.code is used so the shortcut survives Shift remapping digits.
      const match = /^Digit([1-7])$/.exec(event.code);
      if (!match) {
        return;
      }

      event.preventDefault();
      const day = weekDays[Number(match[1]) - 1];
      actions.moveToDate(selectedTaskId, day);
      toast(`Moved to ${formatDayHeader(day)}.`);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, selectedTaskId, weekDays, toast]);

  const weeklyEntry = ensureWeekly(data, weekStart);

  const cards: CardHandlers = {
    selectedTaskId,
    onSelect: setSelectedTaskId,
    onOpenDetail: onOpenTask,
    onToggleDone: actions.toggleDone,
    onContextMenu: menu.open,
    onFollowUp: setFollowUpFor,
    onReturnToPool: returnToPool,
  };

  const menuActions: TaskMenuActions = {
    openDetails: onOpenTask,
    toggleDone: actions.toggleDone,
    setPriority: (taskId, priority) => actions.patchTask(taskId, { priority }),
    setArea: (taskId, area) => actions.patchTask(taskId, { area }),
    schedule: actions.moveToDate,
    setTime: (taskId, timeOfDay) => actions.patchTask(taskId, { timeOfDay, allDay: undefined }),
    setAllDay: (taskId) => actions.patchTask(taskId, { allDay: true, timeOfDay: undefined }),
    followUp: setFollowUpFor,
    returnToPool,
    remove: (task) => actions.removeTask(task.id),
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDraggingTask(null);
        setDropPreview(null);
      }}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <PlannerHeader
          title={`Week ${getWeekNumber(weekStart)} — ${formatWeekRange(weekStart)}`}
          subtitle="Drag a task onto a day, or select one and press Ctrl+Shift+1–7."
          lensControl={lensControl}
        >
          <Button
            type="button"
            variant={timeBlocking ? "default" : "outline"}
            aria-pressed={timeBlocking}
            title={
              timeBlocking
                ? "Turn time-blocking off and go back to the strip"
                : "Turn time-blocking on — drag tasks onto the hours of the week"
            }
            onClick={() => onTimeBlockingChange(!timeBlocking)}
          >
            <CalendarClock className="size-4" />
            Time-Blocking
          </Button>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              title="Previous week"
              onClick={() => shiftWeek(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              className={STEPPER_LABEL_WIDTH}
              onClick={() => setSelectedDate(toDateKey(new Date()))}
            >
              This week
            </Button>
            <Button variant="outline" size="icon" title="Next week" onClick={() => shiftWeek(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </PlannerHeader>

        <InboxPanel
          className="shrink-0"
          pool={pool}
          unscheduled={unscheduled}
          areas={data.areas}
          domains={data.domains}
          active={inboxBucket}
          onActiveChange={setInboxBucket}
          onCreate={(bucket, parsed) => {
            const result = actions.createFromParsed(
              parsed,
              bucket === "pool" ? "pool" : "planned",
            );
            if (result.errors.length) { toast(result.errors[0], "error"); return false; }
            toast(
              result.conflicts > 0
                ? `${result.created} task${result.created === 1 ? "" : "s"} added with ${result.conflicts} schedule conflict${result.conflicts === 1 ? "" : "s"}.`
                : result.created === 1
                  ? "Task added."
                  : `${result.created} tasks created.`,
            );
            return true;
          }}
          renderTask={(task) => (
            <DraggableTask key={task.id} task={task} areas={data.areas} {...cards} />
          )}
        />

        {/* The strip owns the remaining height and divides it evenly. Each column
            scrolls inside its share, so a busy Tuesday never resizes the week. */}
        <div
          key={weekStart}
          className={cn(
            "grid min-h-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7",
            slide === "right" && "slide-from-right",
            slide === "left" && "slide-from-left",
          )}
        >
          {timeBlocking ? (
            <div className="col-span-full flex min-h-0">
              <TimeBlockGrid
                columns={columns}
                tasks={weekTasks}
                areas={data.areas}
                dayWindow={dayWindow}
                selectedTaskId={selectedTaskId}
                dropPreview={dropPreview}
                onSelect={setSelectedTaskId}
                onOpenDetail={onOpenTask}
                onToggleDone={actions.toggleDone}
                onContextMenu={menu.open}
                onResize={(taskId, start, end) =>
                  actions.patchTask(taskId, {
                    timeOfDay: formatTimeRangeValue({ start, end }),
                    allDay: undefined,
                  })
                }
              />
            </div>
          ) : (
            weekDays.map((day, index) => (
              <DayColumn
                key={day}
                date={day}
                index={index}
                tasks={tasksByDay.get(day) ?? []}
                areas={data.areas}
                cards={cards}
                onOpenDay={onOpenDay}
              />
            ))
          )}
        </div>

        <Collapsible open={notesOpen} onOpenChange={setNotesOpen} className="shrink-0">
          <div className="rounded-lg border bg-card">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
              >
                Week notes
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform duration-200",
                    notesOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t p-3">
                <Textarea
                  value={weeklyEntry.notes}
                  placeholder="What matters this week?"
                  onChange={(event) =>
                    execute({
                      type: "weekly.set",
                      weekStart,
                      notes: event.target.value,
                    })
                  }
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>

      <FollowUpPrompt
        task={followUpFor}
        onClose={() => setFollowUpFor(null)}
        onCreate={(title, date) => {
          if (followUpFor) {
            actions.createFollowUp(followUpFor.id, title, date);
            toast("Follow-up created.");
          }
          setFollowUpFor(null);
        }}
      />

      <TaskContextMenu
        task={flatAllTasks.find((task) => task.id === menu.taskId) ?? null}
        position={menu.position}
        areas={data.areas}
        domains={data.domains}
        actions={menuActions}
        onClose={menu.close}
      />

      <DragOverlay>
        {draggingTask ? (
          <TaskCard task={draggingTask} areas={data.areas} compact className="shadow-lg" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

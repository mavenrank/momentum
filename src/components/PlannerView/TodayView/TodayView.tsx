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
import { CalendarClock, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RollingText } from "@/components/ui/rolling-text";
import { useToast } from "@/components/ui/toast";
import { PlannerHeader, STEPPER_LABEL_WIDTH } from "../PlannerHeader";
import { QuickAdd } from "../QuickAdd";
import { TaskCard, type TaskCardProps } from "../TaskCard";
import { FollowUpPrompt } from "../FollowUpPrompt";
import { TaskContextMenu, useTaskContextMenu } from "../TaskContextMenu";
import type { TaskMenuActions } from "../TaskContextMenu";
import { TaskSuggestion } from "../TaskSuggestion";
import { VirtualTaskList, type VirtualTaskItem } from "../VirtualTaskList";
import { computeDayWindow, TimeBlockGrid, type TimeBlockColumn } from "../TimeBlockGrid";
import { blockTask, resolveTimeBlockDrop } from "../timeBlockDnd";
import {
  addDays,
  formatDayHeader,
  formatFriendlyDate,
  formatTimeRangeValue,
  toDateKey,
} from "@/lib/date";
import { poolTasks, unscheduledTasks } from "@/lib/plannerData";
import { cn } from "@/lib/utils";
import type { PlannerActions } from "@/hooks/usePlannerActions";
import { compareByTiming } from "@/types/planner";
import type { DailyTask, PlannerData } from "@/types/planner";

interface TodayViewProps {
  data: PlannerData;
  actions: PlannerActions;
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  /** The Today/Week switch, rendered inline with this view's own controls. */
  lensControl?: React.ReactNode;
  timeBlocking: boolean;
  onTimeBlockingChange: (on: boolean) => void;
  onOpenTask: (taskId: string) => void;
}

interface Column extends TimeBlockColumn {
  tasks: DailyTask[];
  /** Yesterday's unfinished work — the only column that needs triage. */
  isLeftover?: boolean;
}

/** A card that can be dragged onto the time grid. Used by the Pool rail. */
function DraggableTaskCard({ className, ...props }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.task.id,
  });

  return (
    <TaskCard
      ref={setNodeRef}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-40", className)}
      {...props}
      {...attributes}
      {...listeners}
    />
  );
}

export function TodayView({
  data,
  actions,
  selectedDate,
  setSelectedDate,
  lensControl,
  timeBlocking,
  onTimeBlockingChange,
  onOpenTask,
}: TodayViewProps) {
  const { toast } = useToast();
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = React.useState<DailyTask | null>(null);
  const [poolCollapsed, setPoolCollapsed] = React.useState(false);
  const [draggingTask, setDraggingTask] = React.useState<DailyTask | null>(null);
  const [dropPreview, setDropPreview] = React.useState<{
    date: string;
    minutes: number;
  } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const previousDate = React.useRef(selectedDate);
  const rollDirection = selectedDate < previousDate.current ? "down" : "up";
  const menu = useTaskContextMenu();

  React.useEffect(() => { previousDate.current = selectedDate; }, [selectedDate]);

  const yesterday = addDays(selectedDate, -1);
  const tomorrow = addDays(selectedDate, 1);
  const dayAfter = addDays(selectedDate, 2);

  const sensors = useSensors(
    // A small activation distance keeps click-to-select working.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const flatAllTasks = React.useMemo(
    () => Object.values(data.daily).flatMap((entry) => entry.tasks),
    [data.daily],
  );

  const scheduledByDate = React.useMemo(() => {
    const byDate = new Map<string, DailyTask[]>();
    for (const task of flatAllTasks) {
      if (!task.scheduledDate) continue;
      const group = byDate.get(task.scheduledDate) ?? [];
      group.push(task);
      byDate.set(task.scheduledDate, group);
    }
    return byDate;
  }, [flatAllTasks]);
  const doingTasks = React.useMemo(() => flatAllTasks.filter((task) => task.status === "doing"), [flatAllTasks]);
  const leftovers = React.useMemo(
    () => (scheduledByDate.get(yesterday) ?? []).filter((task) => task.status !== "done"),
    [scheduledByDate, yesterday],
  );

  /**
   * The three columns follow the work: while yesterday still has unfinished
   * tasks the board looks back so they can be triaged, and the moment it is
   * clear the board rolls forward to today, tomorrow and the day after.
   */
  const columns = React.useMemo<Column[]>(() => {
    // All-day commitments head each column, then timed work in clock order.
    const on = (date: string) => [...(scheduledByDate.get(date) ?? [])].sort(compareByTiming);

    const todayColumn: Column = {
      key: "today",
      label: "Today",
      date: selectedDate,
      tasks: [...(scheduledByDate.get(selectedDate) ?? []), ...doingTasks.filter((task) => task.scheduledDate !== selectedDate)]
        .sort(compareByTiming),
    };

    if (leftovers.length > 0) {
      return [
        {
          key: "yesterday",
          label: "Yesterday",
          date: yesterday,
          tasks: [...leftovers].sort(compareByTiming),
          isLeftover: true,
        },
        todayColumn,
        { key: "tomorrow", label: "Tomorrow", date: tomorrow, tasks: on(tomorrow) },
      ];
    }

    return [
      todayColumn,
      { key: "tomorrow", label: "Tomorrow", date: tomorrow, tasks: on(tomorrow) },
      { key: "dayAfter", label: "Day after", date: dayAfter, tasks: on(dayAfter) },
    ];
  }, [scheduledByDate, doingTasks, leftovers, selectedDate, yesterday, tomorrow, dayAfter]);

  const pool = React.useMemo(() => poolTasks(data), [data]);
  const unscheduled = React.useMemo(() => unscheduledTasks(data), [data]);
  const railTasks = React.useMemo(() => [...pool, ...unscheduled], [pool, unscheduled]);
  const railItems = React.useMemo<VirtualTaskItem[]>(() => [
    ...pool.map((task) => ({ key: task.id, task })),
    ...(unscheduled.length ? [{ key: "unscheduled-heading", label: "Unscheduled" }] : []),
    ...unscheduled.map((task) => ({ key: task.id, task })),
  ], [pool, unscheduled]);

  // The grid draws by date, so it wants exactly what is scheduled on those days.
  const columnDates = React.useMemo(() => columns.map((column) => column.date), [columns]);
  const gridTasks = React.useMemo(
    () => columnDates.flatMap((date) => scheduledByDate.get(date) ?? []),
    [scheduledByDate, columnDates],
  );
  // Shared with the grid so the pixels and the drop maths agree.
  const dayWindow = React.useMemo(() => computeDayWindow(gridTasks), [gridTasks]);

  const busiestDay = Math.max(...columns.map((column) => column.tasks.length), 0);
  // The rail widens only when it is carrying more than the busiest day column.
  const railGrows = railTasks.length > Math.max(busiestDay, 3);
  // While time-blocking the rail also has to exist as somewhere to drop a task
  // back to, so it stays on screen even when the Pool is empty.
  const railVisible = railTasks.length > 0 || timeBlocking;
  const railOpen = railVisible && !poolCollapsed;

  const todayColumn = columns.find((column) => column.key === "today");
  const stats = React.useMemo(() => {
    const tasks = todayColumn?.tasks ?? [];
    return {
      scheduled: tasks.filter((task) => task.status !== "done").length,
      waiting: tasks.filter((task) => task.status === "waiting").length,
      overdue: leftovers.length,
    };
  }, [todayColumn, leftovers]);

  const flatTasks = React.useMemo(() => columns.flatMap((column) => column.tasks), [columns]);

  function focusTask(taskId: string) {
    setSelectedTaskId(taskId);
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)
        ?.focus();
    });
  }

  function moveSelectionWithinColumn(task: DailyTask, delta: number) {
    const column = columns.find((candidate) =>
      candidate.tasks.some((entry) => entry.id === task.id),
    );
    const index = column?.tasks.findIndex((entry) => entry.id === task.id) ?? -1;
    const next = index >= 0 ? column?.tasks[index + delta] : undefined;
    if (next) {
      focusTask(next.id);
    }
  }

  function moveSelectionAcrossColumns(task: DailyTask, delta: number) {
    const columnIndex = columns.findIndex((candidate) =>
      candidate.tasks.some((entry) => entry.id === task.id),
    );
    const target = columns[columnIndex + delta];
    if (target?.tasks.length) {
      focusTask(target.tasks[0].id);
    }
  }

  function deleteTask(task: DailyTask, fromMenu = false) {
    if (!fromMenu && !window.confirm(`Delete “${task.title}”?`)) {
      return;
    }
    const index = flatTasks.findIndex((entry) => entry.id === task.id);
    actions.removeTask(task.id);
    const neighbour = flatTasks[index + 1] ?? flatTasks[index - 1];
    setSelectedTaskId(neighbour?.id ?? null);
  }

  function handleTaskKeyDown(event: React.KeyboardEvent, task: DailyTask) {
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        // Alt+Enter opens the full editor, where the long description lives.
        if (event.altKey) {
          onOpenTask(task.id);
        } else {
          setEditingTaskId(task.id);
        }
        break;
      case " ":
        event.preventDefault();
        actions.toggleDone(task.id);
        break;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        deleteTask(task);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveSelectionWithinColumn(task, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveSelectionWithinColumn(task, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveSelectionAcrossColumns(task, 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveSelectionAcrossColumns(task, -1);
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------- actions -- */

  function returnToPool(taskId: string) {
    actions.returnToPool(taskId);
    toast("Pulled back to the Pool.");
  }

  const menuActions: TaskMenuActions = {
    openDetails: onOpenTask,
    toggleDone: actions.toggleDone,
    setPriority: (taskId, priority) => actions.patchTask(taskId, { priority }),
    setArea: (taskId, area) => actions.patchTask(taskId, { area }),
    schedule: actions.moveToDate,
    setTime: (taskId, timeOfDay) =>
      actions.patchTask(taskId, { timeOfDay, allDay: undefined }),
    setAllDay: (taskId) => actions.patchTask(taskId, { allDay: true, timeOfDay: undefined }),
    followUp: setFollowUpFor,
    returnToPool,
    remove: (task) => deleteTask(task, true),
  };

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
      case "pool":
        returnToPool(taskId);
        break;
      case "unscheduled":
        actions.moveToDate(taskId, undefined);
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

  /* -------------------------------------------------------------- render -- */

  const renderCard = (
    task: DailyTask,
    options?: { compact?: boolean; draggable?: boolean },
  ) => {
    const Card = options?.draggable ? DraggableTaskCard : TaskCard;

    return (
      <Card
        key={task.id}
        task={task}
        areas={data.areas}
        domains={data.domains}
        compact={options?.compact}
        selected={selectedTaskId === task.id}
        editing={editingTaskId === task.id}
        onFocus={() => setSelectedTaskId(task.id)}
        onKeyDown={(event) => handleTaskKeyDown(event, task)}
        onDoubleClick={() => onOpenTask(task.id)}
        onContextMenu={(event) => menu.open(event, task.id)}
        onCommitTitle={(title) => {
          if (title.trim()) {
            actions.patchTask(task.id, { title: title.trim() });
          }
          setEditingTaskId(null);
          focusTask(task.id);
        }}
        onCancelEdit={() => {
          setEditingTaskId(null);
          focusTask(task.id);
        }}
        onToggleDone={() => actions.toggleDone(task.id)}
        onOpenTask={() => onOpenTask(task.id)}
        onFollowUp={() => setFollowUpFor(task)}
        onReturnToPool={() => returnToPool(task.id)}
        suggestion={
          <TaskSuggestion
            task={task}
            onSetTime={(time) => actions.patchTask(task.id, { timeOfDay: time, allDay: undefined })}
            onSchedule={(date) => actions.moveToDate(task.id, date)}
            onSetAllDay={() => actions.patchTask(task.id, { allDay: true, timeOfDay: undefined })}
          />
        }
      />
    );
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
      <div ref={containerRef} className="flex h-full min-h-0 flex-col gap-3">
        <PlannerHeader
          title={
            <RollingText
              value={formatFriendlyDate(selectedDate)}
              direction={rollDirection}
            />
          }
          subtitle={`${stats.scheduled} scheduled · ${stats.waiting} waiting · ${stats.overdue} overdue`}
          lensControl={lensControl}
        >
          {/* One switch, not a choice of two views: the board is the resting
              state and time-blocking is something you turn on. */}
          <Button
            type="button"
            variant={timeBlocking ? "default" : "outline"}
            aria-pressed={timeBlocking}
            title={
              timeBlocking
                ? "Turn time-blocking off and go back to the board"
                : "Turn time-blocking on — drag tasks onto the hours of the day"
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
              title="Previous day"
              onClick={() => setSelectedDate((current) => addDays(current, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              className={STEPPER_LABEL_WIDTH}
              onClick={() => setSelectedDate(toDateKey(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="Next day"
              onClick={() => setSelectedDate((current) => addDays(current, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </PlannerHeader>

        {/* The composer keeps to the width of the board; the Pool sits alongside
            it rather than letting a full-width field stretch across the screen. */}
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <QuickAdd
              areas={data.areas}
              domains={data.domains}
              onCreate={(tasks) => {
                const result = actions.createFromParsed(tasks);
                if (result.errors.length) { toast(result.errors[0], "error"); return false; }
                const scheduled = tasks.filter((task) => task.scheduledDate).length;
                toast(
                  result.conflicts > 0
                    ? `${result.created} task${result.created === 1 ? "" : "s"} created with ${result.conflicts} schedule conflict${result.conflicts === 1 ? "" : "s"}.`
                    : result.created === 1
                      ? scheduled === 1
                        ? "Task scheduled."
                        : "Task added to the Pool."
                      : `${result.created} tasks created.`,
                );
                return true;
              }}
            />

            {timeBlocking ? (
              <TimeBlockGrid
                columns={columns}
                tasks={gridTasks}
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
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
                {columns.map((column) => (
                  <section
                    key={column.key}
                    aria-label={`${column.label} — ${formatDayHeader(column.date)}`}
                    className={cn(
                      "flex min-h-0 flex-col rounded-lg border bg-muted/30 transition-colors",
                      column.key === "today" && "border-ring/40 bg-muted/50",
                      column.isLeftover && "border-[var(--priority-must)]/30",
                    )}
                  >
                    <header className="flex items-baseline justify-between border-b px-3 py-2">
                      <div>
                        <span
                          className={cn(
                            "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                            column.isLeftover && "text-[var(--priority-must)]",
                          )}
                        >
                          {column.label}
                        </span>
                        <div className="text-sm font-semibold">
                          {formatDayHeader(column.date)}
                        </div>
                      </div>
                      {column.tasks.length > 0 ? (
                        <Badge variant="muted">{column.tasks.length}</Badge>
                      ) : null}
                    </header>

                    <div
                      role="list"
                      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2"
                    >
                      {column.tasks.length === 0 ? (
                        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                          Nothing here yet.
                        </p>
                      ) : null}

                      {column.tasks.map((task) => renderCard(task))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {railVisible ? (
            <PoolRail
              open={railOpen}
              grows={railGrows}
              count={railTasks.length}
              onToggle={() => setPoolCollapsed((collapsed) => !collapsed)}
              items={railItems}
              renderTask={(task) => renderCard(task, { compact: !railGrows, draggable: timeBlocking })}
            />
          ) : null}
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
      </div>

      <DragOverlay>
        {draggingTask ? (
          <TaskCard task={draggingTask} areas={data.areas} compact className="shadow-lg" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------------------------------------ pool rail -- */

/** Dropping a scheduled task here strips its date and time in one move. */
function PoolRail({
  open,
  grows,
  count,
  onToggle,
  items,
  renderTask,
}: {
  open: boolean;
  grows: boolean;
  count: number;
  onToggle: () => void;
  items: VirtualTaskItem[];
  renderTask: (task: DailyTask) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });

  return (
    <aside
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 shrink-0 flex-col transition-all duration-200",
        open ? (grows ? "w-80" : "w-64") : "w-11",
      )}
    >
      <section
        className={cn(
          "flex min-h-0 flex-1 flex-col rounded-lg border bg-card transition-colors",
          isOver && "border-ring bg-accent",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          title={open ? "Collapse the Pool" : "Expand the Pool"}
          className={cn(
            "flex shrink-0 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
            open ? "justify-between border-b" : "flex-col justify-start gap-2 py-3",
          )}
        >
          <span
            className={cn(
              "flex items-center gap-1.5",
              // Collapsed, the label turns on its side like a tab.
              !open && "[writing-mode:vertical-rl]",
            )}
          >
            <Inbox className="size-3.5" />
            Pool
          </span>
          <Badge variant="muted">{count}</Badge>
        </button>

        {open ? (
          <VirtualTaskList items={items} renderTask={renderTask} empty="Drop a task here to clear its date and time." estimatedTaskHeight={96} className="min-h-0 flex-1 p-2" />
        ) : null}
      </section>
    </aside>
  );
}

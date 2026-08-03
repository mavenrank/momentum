import * as React from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RollingText } from "@/components/ui/rolling-text";
import { useToast } from "@/components/ui/toast";
import { QuickAdd } from "../QuickAdd";
import { TaskCard } from "../TaskCard";
import { FollowUpPrompt } from "../FollowUpPrompt";
import { TaskDetailDialog } from "../TaskDetailDialog";
import { TaskSuggestion } from "../TaskSuggestion";
import { addDays, formatDayHeader, formatFriendlyDate, toDateKey } from "@/lib/date";
import { poolTasks, unscheduledTasks } from "@/lib/plannerData";
import { cn } from "@/lib/utils";
import type { PlannerActions } from "@/hooks/usePlannerActions";
import { compareByTiming } from "@/types/planner";
import type { DailyTask, PlannerData } from "@/types/planner";

interface TodayViewProps {
  data: PlannerData;
  actions: PlannerActions;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

interface Column {
  key: string;
  label: string;
  date: string;
  tasks: DailyTask[];
  /** Yesterday's unfinished work — the only column that needs triage. */
  isLeftover?: boolean;
}

export function TodayView({ data, actions, selectedDate, setSelectedDate }: TodayViewProps) {
  const { toast } = useToast();
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = React.useState<DailyTask | null>(null);
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null);
  const [slide, setSlide] = React.useState<"left" | "right" | null>(null);
  const [poolCollapsed, setPoolCollapsed] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const yesterday = addDays(selectedDate, -1);
  const tomorrow = addDays(selectedDate, 1);
  const dayAfter = addDays(selectedDate, 2);

  const flatAllTasks = React.useMemo(
    () => Object.values(data.daily).flatMap((entry) => entry.tasks),
    [data.daily],
  );

  const leftovers = React.useMemo(
    () =>
      flatAllTasks.filter(
        (task) => task.scheduledDate === yesterday && task.status !== "done",
      ),
    [flatAllTasks, yesterday],
  );

  /**
   * The three columns follow the work: while yesterday still has unfinished
   * tasks the board looks back so they can be triaged, and the moment it is
   * clear the board rolls forward to today, tomorrow and the day after.
   */
  const columns = React.useMemo<Column[]>(() => {
    // All-day commitments head each column, then timed work in clock order.
    const on = (date: string) =>
      flatAllTasks.filter((task) => task.scheduledDate === date).sort(compareByTiming);

    const todayColumn: Column = {
      key: "today",
      label: "Today",
      date: selectedDate,
      tasks: flatAllTasks
        .filter((task) => task.scheduledDate === selectedDate || task.status === "doing")
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
  }, [flatAllTasks, leftovers, selectedDate, yesterday, tomorrow, dayAfter]);

  const pool = React.useMemo(() => poolTasks(data), [data]);
  const unscheduled = React.useMemo(() => unscheduledTasks(data), [data]);
  const railTasks = React.useMemo(() => [...pool, ...unscheduled], [pool, unscheduled]);

  const busiestDay = Math.max(...columns.map((column) => column.tasks.length), 0);
  // The rail widens only when it is carrying more than the busiest day column.
  const railGrows = railTasks.length > Math.max(busiestDay, 3);
  const railOpen = railTasks.length > 0 && !poolCollapsed;

  const todayColumn = columns.find((column) => column.key === "today");
  const stats = React.useMemo(() => {
    const tasks = todayColumn?.tasks ?? [];
    return {
      scheduled: tasks.filter((task) => task.status !== "done").length,
      waiting: tasks.filter((task) => task.status === "waiting").length,
      overdue: leftovers.length,
    };
  }, [todayColumn, leftovers]);

  const flatTasks = React.useMemo(
    () => columns.flatMap((column) => column.tasks),
    [columns],
  );

  function goToDate(date: string) {
    if (date === selectedDate) {
      return;
    }
    setSlide(date > selectedDate ? "right" : "left");
    setSelectedDate(date);
    window.setTimeout(() => setSlide(null), 260);
  }

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

  function handleTaskKeyDown(event: React.KeyboardEvent, task: DailyTask) {
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        // Alt+Enter opens the full editor, where the long description lives.
        if (event.altKey) {
          setDetailTaskId(task.id);
        } else {
          setEditingTaskId(task.id);
        }
        break;
      case " ":
        event.preventDefault();
        actions.toggleDone(task.id);
        if (task.status !== "done") {
          setFollowUpFor(task);
        }
        break;
      case "Delete":
      case "Backspace": {
        event.preventDefault();
        if (window.confirm(`Delete “${task.title}”?`)) {
          const index = flatTasks.findIndex((entry) => entry.id === task.id);
          actions.removeTask(task.id);
          const neighbour = flatTasks[index + 1] ?? flatTasks[index - 1];
          setSelectedTaskId(neighbour?.id ?? null);
        }
        break;
      }
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

  const renderCard = (task: DailyTask, options?: { compact?: boolean }) => (
    <TaskCard
      key={task.id}
      task={task}
      areas={data.areas}
      compact={options?.compact}
      selected={selectedTaskId === task.id}
      editing={editingTaskId === task.id}
      onFocus={() => setSelectedTaskId(task.id)}
      onKeyDown={(event) => handleTaskKeyDown(event, task)}
      onDoubleClick={() => setDetailTaskId(task.id)}
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
      onToggleDone={() => {
        actions.toggleDone(task.id);
        // Completing a task is the moment to ask about a follow-up.
        if (task.status !== "done") {
          setFollowUpFor(task);
        }
      }}
      suggestion={
        <TaskSuggestion
          task={task}
          onSetTime={(time) =>
            actions.patchTask(task.id, { timeOfDay: time, allDay: undefined })
          }
          onSchedule={(date) => actions.moveToDate(task.id, date)}
          onSetAllDay={() =>
            actions.patchTask(task.id, { allDay: true, timeOfDay: undefined })
          }
        />
      }
    />
  );

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            <RollingText
              value={formatFriendlyDate(selectedDate)}
              direction={slide === "left" ? "down" : "up"}
            />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.scheduled} scheduled · {stats.waiting} waiting · {stats.overdue} overdue
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" title="Previous day" onClick={() => goToDate(yesterday)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => goToDate(toDateKey(new Date()))}>
            Today
          </Button>
          <Button variant="outline" size="icon" title="Next day" onClick={() => goToDate(tomorrow)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      {/* The composer keeps to the width of the board; the Pool sits alongside
          it rather than letting a full-width field stretch across the screen. */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <QuickAdd
            areas={data.areas}
            onCreate={(tasks) => {
              const created = actions.createFromParsed(tasks);
              const scheduled = tasks.filter((task) => task.scheduledDate).length;
              toast(
                created === 1
                  ? scheduled === 1
                    ? "Task scheduled."
                    : "Task added to the Pool."
                  : `${created} tasks created.`,
              );
            }}
          />

          <div
            key={columns[0].key + selectedDate}
            className={cn(
              "grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3",
              slide === "right" && "slide-from-right",
              slide === "left" && "slide-from-left",
            )}
          >
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
                    <div className="text-sm font-semibold">{formatDayHeader(column.date)}</div>
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
        </div>

        {railTasks.length > 0 ? (
          <aside
            className={cn(
              "flex min-h-0 shrink-0 flex-col transition-all duration-200",
              railOpen ? (railGrows ? "w-80" : "w-64") : "w-11",
            )}
          >
            <section className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card">
              <button
                type="button"
                onClick={() => setPoolCollapsed((collapsed) => !collapsed)}
                title={railOpen ? "Collapse the Pool" : "Expand the Pool"}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
                  railOpen ? "justify-between border-b" : "flex-col justify-start gap-2 py-3",
                )}
              >
                <span
                  className={cn(
                    "flex items-center gap-1.5",
                    // Collapsed, the label turns on its side like a tab.
                    !railOpen && "[writing-mode:vertical-rl]",
                  )}
                >
                  <Inbox className="size-3.5" />
                  Pool
                </span>
                <Badge variant="muted">{railTasks.length}</Badge>
              </button>

              {railOpen ? (
                <div role="list" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
                  {pool.map((task) => renderCard(task, { compact: !railGrows }))}

                  {unscheduled.length > 0 ? (
                    <>
                      <p className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Unscheduled
                      </p>
                      {unscheduled.map((task) => renderCard(task, { compact: !railGrows }))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>
          </aside>
        ) : null}
      </div>

      <TaskDetailDialog
        task={flatAllTasks.find((task) => task.id === detailTaskId) ?? null}
        areas={data.areas}
        allTasks={flatAllTasks}
        onClose={() => setDetailTaskId(null)}
        onSave={(taskId, patch) => actions.patchTask(taskId, patch)}
        onDelete={(taskId) => actions.removeTask(taskId)}
      />

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
    </div>
  );
}

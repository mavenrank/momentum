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
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { QuickAdd } from "../QuickAdd";
import { TaskCard } from "../TaskCard";
import { TaskDetailDialog } from "../TaskDetailDialog";
import {
  addDays,
  formatDayHeader,
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
import type { Dispatch, SetStateAction } from "react";

interface WeekViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
  actions: PlannerActions;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onOpenDay: (date: string) => void;
}

/* ------------------------------------------------------------- dnd atoms -- */

function DraggableTask({
  task,
  areas,
  selected,
  onSelect,
  onOpenDetail,
  onToggleDone,
}: {
  task: DailyTask;
  areas: PlannerData["areas"];
  selected: boolean;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      areas={areas}
      compact
      selected={selected}
      onFocus={() => onSelect(task.id)}
      onClick={() => onSelect(task.id)}
      onDoubleClick={() => onOpenDetail(task.id)}
      onToggleDone={() => onToggleDone(task.id)}
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
  selectedTaskId,
  onSelect,
  onOpenDetail,
  onToggleDone,
  onOpenDay,
  index,
}: {
  date: string;
  tasks: DailyTask[];
  areas: PlannerData["areas"];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onOpenDay: (date: string) => void;
  index: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const isToday = date === toDateKey(new Date());

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-40 flex-col rounded-md border bg-muted/25 transition-colors",
        isOver && "border-ring bg-accent",
        isToday && "border-ring/50",
      )}
    >
      <button
        type="button"
        onClick={() => onOpenDay(date)}
        title={`Open ${formatDayHeader(date)} in the Today view`}
        className="flex items-center justify-between border-b px-2 py-1.5 text-left text-xs font-semibold hover:bg-accent/60"
      >
        <span className={cn(isToday && "text-primary")}>{formatDayHeader(date)}</span>
        <span className="font-mono text-[10px] font-normal text-muted-foreground">
          ⌃⇧{index + 1}
        </span>
      </button>

      <div role="list" className="flex flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        {tasks.map((task) => (
          <DraggableTask
            key={task.id}
            task={task}
            areas={areas}
            selected={selectedTaskId === task.id}
            onSelect={onSelect}
            onOpenDetail={onOpenDetail}
            onToggleDone={onToggleDone}
          />
        ))}
      </div>
    </div>
  );
}

interface DropZoneProps {
  id: string;
  title: string;
  tasks: DailyTask[];
  areas: PlannerData["areas"];
  placeholder: string;
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onCreate: (parsed: Parameters<PlannerActions["createFromParsed"]>[0]) => void;
}

/** Droppable panel above the strip — dropping here clears the day assignment. */
function TaskDropZone({
  id,
  title,
  tasks,
  areas,
  placeholder,
  selectedTaskId,
  onSelect,
  onOpenDetail,
  onToggleDone,
  onCreate,
}: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 flex-col rounded-lg border bg-card transition-colors",
        isOver && "border-ring bg-accent",
      )}
    >
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <Badge variant="muted">{tasks.length}</Badge>
      </header>
      <div className="space-y-2 p-2">
        <QuickAdd areas={areas} placeholder={placeholder} onCreate={onCreate} />
        <div role="list" className="flex max-h-44 flex-col gap-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nothing here.</p>
          ) : null}
          {tasks.map((task) => (
            <DraggableTask
              key={task.id}
              task={task}
              areas={areas}
              selected={selectedTaskId === task.id}
              onSelect={onSelect}
              onOpenDetail={onOpenDetail}
              onToggleDone={onToggleDone}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ view -- */

export function WeekView({
  data,
  setData,
  actions,
  selectedDate,
  setSelectedDate,
  onOpenDay,
}: WeekViewProps) {
  const { toast } = useToast();
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [draggingTask, setDraggingTask] = React.useState<DailyTask | null>(null);
  const [slide, setSlide] = React.useState<"left" | "right" | null>(null);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null);

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
        weekDays.map((day) => [
          day,
          flatAllTasks.filter((task) => task.scheduledDate === day),
        ]),
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

  function shiftWeek(direction: -1 | 1) {
    setSlide(direction === 1 ? "right" : "left");
    setSelectedDate(addDays(selectedDate, direction * 7));
    window.setTimeout(() => setSlide(null), 260);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingTask(flatAllTasks.find((task) => task.id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTask(null);
    const overId = event.over?.id;
    if (typeof overId !== "string") {
      return;
    }

    const taskId = String(event.active.id);
    if (overId === "unscheduled") {
      actions.moveToDate(taskId, undefined);
      return;
    }
    if (overId === "pool") {
      actions.setStatus(taskId, "pool");
      actions.moveToDate(taskId, undefined);
      return;
    }
    if (overId.startsWith("day:")) {
      actions.moveToDate(taskId, overId.slice(4));
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

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col gap-3">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Week {getWeekNumber(weekStart)} — {formatWeekRange(weekStart)}
            </h2>
            <p className="text-xs text-muted-foreground">
              Drag a task onto a day, or select one and press Ctrl+Shift+1–7.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" title="Previous week" onClick={() => shiftWeek(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(toDateKey(new Date()))}
            >
              This week
            </Button>
            <Button variant="outline" size="icon" title="Next week" onClick={() => shiftWeek(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </header>

        <div className="grid gap-3 lg:grid-cols-2">
          <TaskDropZone
            id="unscheduled"
            title="Unscheduled (this week)"
            tasks={unscheduled}
            areas={data.areas}
            placeholder="Commit a task to this week…"
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            onOpenDetail={setDetailTaskId}
            onToggleDone={actions.toggleDone}
            onCreate={(tasks) => {
              const created = actions.createFromParsed(tasks, "planned");
              toast(created === 1 ? "Task added." : `${created} tasks created.`);
            }}
          />
          <TaskDropZone
            id="pool"
            title="Pool"
            tasks={pool}
            areas={data.areas}
            placeholder="Dump an untriaged task…"
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            onOpenDetail={setDetailTaskId}
            onToggleDone={actions.toggleDone}
            onCreate={(tasks) => {
              const created = actions.createFromParsed(tasks, "pool");
              toast(created === 1 ? "Task added to the Pool." : `${created} tasks created.`);
            }}
          />
        </div>

        <div
          key={weekStart}
          className={cn(
            "grid min-h-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7",
            slide === "right" && "slide-from-right",
            slide === "left" && "slide-from-left",
          )}
        >
          {weekDays.map((day, index) => (
            <DayColumn
              key={day}
              date={day}
              index={index}
              tasks={tasksByDay.get(day) ?? []}
              areas={data.areas}
              selectedTaskId={selectedTaskId}
              onSelect={setSelectedTaskId}
              onOpenDetail={setDetailTaskId}
              onToggleDone={actions.toggleDone}
              onOpenDay={onOpenDay}
            />
          ))}
        </div>

        <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
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
                    setData((current) => ({
                      ...current,
                      weekly: {
                        ...current.weekly,
                        [weekStart]: { weekStart, notes: event.target.value },
                      },
                    }))
                  }
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>

      <TaskDetailDialog
        task={flatAllTasks.find((task) => task.id === detailTaskId) ?? null}
        areas={data.areas}
        allTasks={flatAllTasks}
        onClose={() => setDetailTaskId(null)}
        onSave={(taskId, patch) => actions.patchTask(taskId, patch)}
        onDelete={(taskId) => actions.removeTask(taskId)}
      />

      <DragOverlay>
        {draggingTask ? (
          <TaskCard task={draggingTask} areas={data.areas} compact className="shadow-lg" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

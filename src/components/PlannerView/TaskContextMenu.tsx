import * as React from "react";
import {
  CircleDot,
  CornerUpLeft,
  Pencil,
  Repeat2,
  Sun,
  Trash2,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuChip,
  ContextMenuChips,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  type ContextMenuPosition,
} from "@/components/ui/context-menu";
import { getAreaColor } from "@/lib/areas";
import { addDays, toDateKey } from "@/lib/date";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/types/planner";
import type { Area, DailyTask, TaskPriority } from "@/types/planner";

/** Time presets offered in the schedule section, in 24h form. */
const TIME_PRESETS = ["09:00", "12:00", "15:00", "18:00"];

export interface TaskMenuActions {
  openDetails: (taskId: string) => void;
  toggleDone: (taskId: string) => void;
  setPriority: (taskId: string, priority: TaskPriority | undefined) => void;
  setArea: (taskId: string, area: string | undefined) => void;
  schedule: (taskId: string, date: string) => void;
  setTime: (taskId: string, timeOfDay: string | undefined) => void;
  setAllDay: (taskId: string) => void;
  followUp: (task: DailyTask) => void;
  returnToPool: (taskId: string) => void;
  remove: (task: DailyTask) => void;
}

interface TaskContextMenuProps {
  task: DailyTask | null;
  position: ContextMenuPosition | null;
  areas: Area[];
  actions: TaskMenuActions;
  onClose: () => void;
}

/**
 * Everything a task card can do, at the pointer. The card itself stays quiet —
 * this is where the full action set lives so the board doesn't have to carry
 * rows of buttons.
 */
export function TaskContextMenu({
  task,
  position,
  areas,
  actions,
  onClose,
}: TaskContextMenuProps) {
  if (!task) {
    return null;
  }

  const today = toDateKey(new Date());
  const done = task.status === "done";
  // A task already sitting in the Pool with no date has nothing to return to.
  const canReturnToPool = Boolean(task.scheduledDate) || task.status !== "pool";

  /** Runs an action and closes — every item here is a one-shot command. */
  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <ContextMenu position={position} onClose={onClose}>
      <div className="truncate px-2 pb-1 pt-1 text-xs font-medium">{task.title}</div>
      <div className="px-2 pb-1 font-mono text-[0.6875rem] text-muted-foreground">{task.id}</div>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={() => run(() => actions.openDetails(task.id))}>
        <Pencil className="size-3.5" />
        Open details
        <kbd className="ml-auto font-mono text-[0.6875rem] text-muted-foreground">⌥↵</kbd>
      </ContextMenuItem>

      <ContextMenuItem onClick={() => run(() => actions.toggleDone(task.id))}>
        <CircleDot className="size-3.5" />
        {done ? "Mark as not done" : "Mark as done"}
        <kbd className="ml-auto font-mono text-[0.6875rem] text-muted-foreground">Space</kbd>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuLabel>Priority</ContextMenuLabel>
      <ContextMenuChips>
        {TASK_PRIORITIES.map((priority) => (
          <ContextMenuChip
            key={priority}
            active={task.priority === priority}
            onClick={() =>
              run(() =>
                // Clicking the current priority clears it, so the same chip both
                // sets and unsets.
                actions.setPriority(task.id, task.priority === priority ? undefined : priority),
              )
            }
          >
            {PRIORITY_LABELS[priority]}
          </ContextMenuChip>
        ))}
      </ContextMenuChips>

      <ContextMenuLabel>Area</ContextMenuLabel>
      <ContextMenuChips className="max-h-24 overflow-y-auto">
        {areas
          .filter((area) => !area.archived)
          .map((area) => (
            <ContextMenuChip
              key={area.id}
              active={task.area === area.id}
              onClick={() =>
                run(() => actions.setArea(task.id, task.area === area.id ? undefined : area.id))
              }
            >
              <span
                aria-hidden
                className="mr-1 inline-block size-1.5 rounded-full align-middle"
                style={{ backgroundColor: getAreaColor(areas, area.id) }}
              />
              {area.name}
            </ContextMenuChip>
          ))}
      </ContextMenuChips>

      <ContextMenuSeparator />

      <ContextMenuLabel>Schedule</ContextMenuLabel>
      <ContextMenuChips>
        <ContextMenuChip
          active={task.scheduledDate === today}
          onClick={() => run(() => actions.schedule(task.id, today))}
        >
          Today
        </ContextMenuChip>
        <ContextMenuChip
          active={task.scheduledDate === addDays(today, 1)}
          onClick={() => run(() => actions.schedule(task.id, addDays(today, 1)))}
        >
          Tomorrow
        </ContextMenuChip>
        <ContextMenuChip onClick={() => run(() => actions.schedule(task.id, addDays(today, 7)))}>
          +1 week
        </ContextMenuChip>
      </ContextMenuChips>
      <div className="px-2 pb-1.5">
        <input
          type="date"
          value={task.scheduledDate ?? ""}
          aria-label="Pick a date"
          onChange={(event) => {
            if (event.target.value) {
              run(() => actions.schedule(task.id, event.target.value));
            }
          }}
          className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <ContextMenuLabel>Time</ContextMenuLabel>
      <ContextMenuChips>
        {TIME_PRESETS.map((preset) => (
          <ContextMenuChip
            key={preset}
            active={task.timeOfDay?.startsWith(preset)}
            onClick={() => run(() => actions.setTime(task.id, preset))}
          >
            {preset}
          </ContextMenuChip>
        ))}
        <ContextMenuChip active={task.allDay} onClick={() => run(() => actions.setAllDay(task.id))}>
          <Sun className="mr-1 inline size-3 align-middle" />
          All day
        </ContextMenuChip>
        {task.timeOfDay || task.allDay ? (
          <ContextMenuChip onClick={() => run(() => actions.setTime(task.id, undefined))}>
            Clear
          </ContextMenuChip>
        ) : null}
      </ContextMenuChips>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={() => run(() => actions.followUp(task))}>
        <Repeat2 className="size-3.5" />
        Add follow-up
      </ContextMenuItem>

      {canReturnToPool ? (
        <ContextMenuItem onClick={() => run(() => actions.returnToPool(task.id))}>
          <CornerUpLeft className="size-3.5" />
          Pull to Pool
        </ContextMenuItem>
      ) : null}

      <ContextMenuSeparator />

      <ContextMenuItem destructive onClick={() => run(() => actions.remove(task))}>
        <Trash2 className="size-3.5" />
        Delete
      </ContextMenuItem>
    </ContextMenu>
  );
}

/**
 * Tracks which task was right-clicked and where. Kept here so every view wires
 * the menu up the same way.
 */
export function useTaskContextMenu() {
  const [state, setState] = React.useState<{
    taskId: string;
    position: ContextMenuPosition;
  } | null>(null);

  const open = React.useCallback((event: React.MouseEvent, taskId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ taskId, position: { x: event.clientX, y: event.clientY } });
  }, []);

  const close = React.useCallback(() => setState(null), []);

  return { taskId: state?.taskId ?? null, position: state?.position ?? null, open, close };
}

import * as React from "react";
import { AlignLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeOfDay } from "@/lib/date";
import { getAreaColor } from "@/lib/areas";
import { PRIORITY_LABELS } from "@/types/planner";
import type { Area, DailyTask, TaskPriority } from "@/types/planner";

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  must: "text-[var(--priority-must)] border-[var(--priority-must)]/40 bg-[var(--priority-must)]/10",
  should:
    "text-[var(--priority-should)] border-[var(--priority-should)]/40 bg-[var(--priority-should)]/10",
  could:
    "text-[var(--priority-could)] border-[var(--priority-could)]/40 bg-[var(--priority-could)]/10",
  want: "text-[var(--priority-want)] border-[var(--priority-want)]/40 bg-[var(--priority-want)]/10",
};

export interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  task: DailyTask;
  areas: Area[];
  selected?: boolean;
  /** Denser single-line layout used by the week strip. */
  compact?: boolean;
  editing?: boolean;
  onCommitTitle?: (title: string) => void;
  onCancelEdit?: () => void;
  /** Inline nudge rendered under the card body — see TaskSuggestion. */
  suggestion?: React.ReactNode;
  onToggleDone?: () => void;
}

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  {
    task,
    areas,
    selected = false,
    compact = false,
    editing = false,
    onCommitTitle,
    onCancelEdit,
    suggestion,
    onToggleDone,
    className,
    ...props
  },
  ref,
) {
  const [draft, setDraft] = React.useState(task.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      setDraft(task.title);
      // Focus after the input is mounted so the caret lands at the end.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, task.title]);

  const done = task.status === "done";
  const dotColor = getAreaColor(areas, task.area);
  const time = formatTimeOfDay(task.timeOfDay);

  return (
    <div
      ref={ref}
      role="listitem"
      tabIndex={editing ? -1 : 0}
      aria-selected={selected}
      data-task-id={task.id}
      // Full title on hover, since the rendered line is truncated.
      title={[task.title, task.summary].filter(Boolean).join(" — ")}
      className={cn(
        "task-complete-fade group flex w-full items-start gap-2 rounded-md border bg-card text-left shadow-sm transition-all duration-150 focus:outline-none",
        compact ? "px-2 py-1" : "px-2.5 py-2",
        selected
          ? "border-ring ring-2 ring-ring/40"
          : "border-border hover:-translate-y-px hover:border-ring/60 hover:shadow-md focus-visible:border-ring",
        done && "opacity-55",
        className,
      )}
      {...props}
    >
      {/* The area dot doubles as the completion control: its ring carries the
          area colour, and ticking it fills the circle in. */}
      {onToggleDone ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          title={done ? "Mark as not done" : "Mark as done"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleDone();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            done ? "text-background" : "text-transparent hover:text-muted-foreground",
          )}
          style={{
            borderColor: dotColor,
            backgroundColor: done ? dotColor : "transparent",
          }}
        >
          <Check className="size-2.5" strokeWidth={4} />
        </button>
      ) : (
        <span
          aria-hidden
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => onCommitTitle?.(draft)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitTitle?.(draft);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelEdit?.();
              }
            }}
            className="w-full rounded-sm border border-input bg-background px-1 py-0.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "task-complete-fade min-w-0 flex-1 truncate text-sm leading-snug",
                  done && "line-through decoration-muted-foreground",
                )}
              >
                {task.title}
              </span>
              {task.description ? (
                <AlignLeft
                  aria-label="Has a long description"
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : null}
              {time ? (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{time}</span>
              ) : null}
              {task.allDay ? (
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  All day
                </span>
              ) : null}
            </div>

            {/* The summary is a single truncated line; the long body only ever
                appears in the detail dialog. */}
            {task.summary && !compact ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.summary}</p>
            ) : null}
          </>
        )}

        {!editing && (task.priority || task.area || task.status === "waiting") ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {task.priority ? (
              <span
                className={cn(
                  "rounded border px-1 py-px text-[10px] font-semibold uppercase tracking-wide",
                  PRIORITY_STYLE[task.priority],
                )}
              >
                {PRIORITY_LABELS[task.priority]}
              </span>
            ) : null}
            {task.area && !compact ? (
              <span className="text-[10px] text-muted-foreground">#{task.area.toLowerCase()}</span>
            ) : null}
            {task.status === "waiting" ? (
              <span className="rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                Waiting
              </span>
            ) : null}
          </div>
        ) : null}

        {!editing && suggestion ? suggestion : null}
      </div>
    </div>
  );
});

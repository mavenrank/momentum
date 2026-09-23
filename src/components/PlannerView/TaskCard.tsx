import * as React from "react";
import { AlignLeft, Check, CornerUpLeft, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeOfDay } from "@/lib/date";
import { getAreaColor } from "@/lib/areas";
import { PRIORITY_LABELS } from "@/types/planner";
import type { Area, DailyTask, Domain, TaskPriority } from "@/types/planner";

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  must: "text-[var(--priority-must)] border-[var(--priority-must)]/40 bg-[var(--priority-must)]/10",
  should:
    "text-[var(--priority-should)] border-[var(--priority-should)]/40 bg-[var(--priority-should)]/10",
  could:
    "text-[var(--priority-could)] border-[var(--priority-could)]/40 bg-[var(--priority-could)]/10",
  want: "text-[var(--priority-want)] border-[var(--priority-want)]/40 bg-[var(--priority-want)]/10",
};

/**
 * Undoing a schedule is destructive enough to want a beat of hesitation, but a
 * modal for it would be heavier than the action deserves. The button asks
 * "Sure?" in place instead, and gives up on its own if the answer never comes.
 */
const CONFIRM_TIMEOUT_MS = 3000;

function PullToPoolButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (!confirming) {
      return;
    }
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        title="Pull back to the Pool — clears the date and time"
        aria-label="Pull back to the Pool"
        onClick={(event) => {
          event.stopPropagation();
          setConfirming(true);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-[0.6875rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <CornerUpLeft className="size-3" />
        Pool
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Confirm — clears the date and time"
      onClick={(event) => {
        event.stopPropagation();
        setConfirming(false);
        onConfirm();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onBlur={() => setConfirming(false)}
      autoFocus
      className="rounded border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-destructive transition-colors hover:bg-destructive/20"
    >
      Sure?
    </button>
  );
}

export interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  task: DailyTask;
  areas: Area[];
  domains?: Domain[];
  selected?: boolean;
  /** Denser single-line layout used by the week strip. */
  compact?: boolean;
  editing?: boolean;
  onCommitTitle?: (title: string) => void;
  onCancelEdit?: () => void;
  /** Inline nudge rendered under the card body — see TaskSuggestion. */
  suggestion?: React.ReactNode;
  onToggleDone?: () => void;
  /** Opens the follow-up composer. Shown bottom-right on hover. */
  onFollowUp?: () => void;
  /** Clears the date and time and sends the task back to the Pool. */
  onReturnToPool?: () => void;
}

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  {
    task,
    areas,
    domains,
    selected = false,
    compact = false,
    editing = false,
    onCommitTitle,
    onCancelEdit,
    suggestion,
    onToggleDone,
    onFollowUp,
    onReturnToPool,
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
  const taskArea = areas.find((area) => area.id === task.area);
  const areaIsAmbiguous = taskArea && areas.some((area) => area.id !== taskArea.id && area.name.toLowerCase() === taskArea.name.toLowerCase());
  const parentDomain = domains?.find((domain) => domain.id === taskArea?.domainId);
  const areaLabel = taskArea ? areaIsAmbiguous && parentDomain ? `${parentDomain.name} · ${taskArea.name}` : taskArea.name : "Unknown Area";
  const time = formatTimeOfDay(task.timeOfDay);
  // Nothing to pull back when the task is already untriaged and undated.
  const showPullToPool =
    Boolean(onReturnToPool) && (Boolean(task.scheduledDate) || task.status !== "pool");
  const hasHoverActions = !editing && (Boolean(onFollowUp) || showPullToPool);

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
        "task-complete-fade group relative flex w-full items-start gap-2 rounded-md border bg-card text-left shadow-sm transition-all duration-150 focus:outline-none",
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
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{time}</span>
              ) : null}
              {task.allDay ? (
                <span className="shrink-0 rounded bg-muted px-1 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
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
                  "rounded border px-1 py-px text-[0.6875rem] font-semibold uppercase tracking-wide",
                  PRIORITY_STYLE[task.priority],
                )}
              >
                {PRIORITY_LABELS[task.priority]}
              </span>
            ) : null}
            {task.area && !compact ? (
              <span className="text-[0.6875rem] text-muted-foreground" title={parentDomain ? `${parentDomain.name} / ${taskArea?.name}` : undefined}>#{areaLabel}</span>
            ) : null}
            {task.status === "waiting" ? (
              <span className="rounded border border-border px-1 py-px text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                Waiting
              </span>
            ) : null}
          </div>
        ) : null}

        {!editing && suggestion ? suggestion : null}
      </div>

      {/* Floated rather than laid out: the row appears on hover without adding
          height, so a card never resizes under the pointer. */}
      {hasHoverActions ? (
        <div
          className={cn(
            "absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md border bg-card/95 px-0.5 py-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity",
            "group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100",
          )}
        >
          {onFollowUp ? (
            <button
              type="button"
              title="Schedule a follow-up to this task"
              onClick={(event) => {
                event.stopPropagation();
                onFollowUp();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[0.6875rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Repeat2 className="size-3" />
              Follow up
            </button>
          ) : null}

          {showPullToPool && onReturnToPool ? (
            <PullToPoolButton onConfirm={onReturnToPool} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

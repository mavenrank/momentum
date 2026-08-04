import * as React from "react";
import { CalendarPlus, Clock, X } from "lucide-react";

import { parseTaskLine } from "@/lib/nlp/taskParser";
import { toDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { DailyTask } from "@/types/planner";

/** Quick presets offered next to the free-text time field. */
const TIME_PRESETS = ["09:00", "12:00", "15:00", "18:00"];

interface TaskSuggestionProps {
  task: DailyTask;
  onSetTime: (timeOfDay: string | undefined) => void;
  onSchedule: (date: string) => void;
  onSetAllDay: () => void;
  className?: string;
}

/**
 * The small nudge that appears under a card: a scheduled task with no time is
 * offered "Add time?", and an untriaged one is offered a day. Both stay out of
 * the way until clicked — nothing is required.
 */
export function TaskSuggestion({
  task,
  onSetTime,
  onSchedule,
  onSetAllDay,
  className,
}: TaskSuggestionProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // An all-day task is already answered — it does not want a time.
  const needsTime =
    Boolean(task.scheduledDate) && !task.timeOfDay && !task.allDay && task.status !== "done";
  const needsDate = !task.scheduledDate && task.status !== "done";

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!needsTime && !needsDate) {
    return null;
  }

  function commit() {
    const text = draft.trim();
    if (!text) {
      setOpen(false);
      return;
    }

    // Reuse the NLP parser so "3pm" and "tomorrow 9am" both work here.
    const parsed = parseTaskLine(text);
    if (parsed.timeOfDay) {
      onSetTime(parsed.timeOfDay);
    }
    if (parsed.scheduledDate) {
      onSchedule(parsed.scheduledDate);
    }

    setDraft("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          // Held back until the card is hovered or focused so rows stay quiet.
          "flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100",
          className,
        )}
      >
        {needsTime ? (
          <>
            <Clock className="size-3" />
            Add time?
          </>
        ) : (
          <>
            <CalendarPlus className="size-3" />
            Schedule?
          </>
        )}
      </button>
    );
  }

  return (
    <div className={cn("mt-1 flex items-center gap-1", className)}>
      <input
        ref={inputRef}
        value={draft}
        placeholder={needsTime ? "3pm or 2-4pm" : "tomorrow 9am"}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        className="h-6 min-w-0 flex-1 rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
      />

      {needsTime
        ? (
            <>
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSetTime(preset);
                    setOpen(false);
                  }}
                  className="shrink-0 rounded border px-1 py-0.5 font-mono text-[0.6875rem] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {preset.slice(0, 2)}
                </button>
              ))}
              <button
                type="button"
                title="This runs all day"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSetAllDay();
                  setOpen(false);
                }}
                className="shrink-0 rounded border px-1 py-0.5 text-[0.6875rem] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                All day
              </button>
            </>
          )
        : (
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSchedule(toDateKey(new Date()));
                setOpen(false);
              }}
              className="shrink-0 rounded border px-1 py-0.5 text-[0.6875rem] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Today
            </button>
          )}

      <button
        type="button"
        title="Dismiss"
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

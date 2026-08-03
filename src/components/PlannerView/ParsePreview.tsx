import { CalendarDays, Clock, Flag, Hash, Inbox, Sun, Type } from "lucide-react";

import { getAreaColor } from "@/lib/areas";
import { formatFriendlyDate, formatTimeOfDay } from "@/lib/date";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS } from "@/types/planner";
import type { ParsedTask } from "@/lib/nlp/taskParser";
import type { Area } from "@/types/planner";

interface ParsePreviewProps {
  parsed: ParsedTask | null;
  areas: Area[];
  /** True when the typed `#tag` doesn't match an existing area yet. */
  isNewArea: boolean;
}

function Field({
  icon: Icon,
  label,
  value,
  tone,
  muted,
}: {
  icon: typeof Type;
  label: string;
  value: string;
  tone?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors duration-200",
        muted ? "border-dashed text-muted-foreground" : "bg-card",
      )}
    >
      <Icon className="size-3 shrink-0" style={tone ? { color: tone } : undefined} />
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn("min-w-0 truncate font-medium", muted && "font-normal")}
        style={tone && !muted ? { color: tone } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Mirrors what the parser extracted while the user types, so the task's shape is
 * visible before it is created.
 */
export function ParsePreview({ parsed, areas, isNewArea }: ParsePreviewProps) {
  if (!parsed) {
    return null;
  }

  const areaColor = parsed.area ? getAreaColor(areas, parsed.area) : undefined;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Field
        icon={Type}
        label="Title"
        value={parsed.title || "—"}
        muted={!parsed.title}
      />

      {parsed.scheduledDate ? (
        <Field
          icon={CalendarDays}
          label="Date"
          value={formatFriendlyDate(parsed.scheduledDate)}
          tone="var(--nlp-date)"
        />
      ) : (
        <Field icon={Inbox} label="Goes to" value="Pool — no date yet" muted />
      )}

      {parsed.timeOfDay ? (
        <Field
          icon={Clock}
          label="Time"
          value={formatTimeOfDay(parsed.timeOfDay)}
          tone="var(--nlp-time)"
        />
      ) : null}

      {parsed.allDay ? (
        <Field icon={Sun} label="Timing" value="All day" tone="var(--nlp-time)" />
      ) : null}

      {parsed.priority ? (
        <Field
          icon={Flag}
          label="Priority"
          value={PRIORITY_LABELS[parsed.priority]}
          tone="var(--nlp-priority)"
        />
      ) : null}

      {parsed.area ? (
        <Field
          icon={Hash}
          label={isNewArea ? "New area" : "Area"}
          value={parsed.area}
          tone={areaColor}
        />
      ) : null}
    </div>
  );
}

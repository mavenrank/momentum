import * as React from "react";
import { CalendarDays, Clock, Flag, Hash, Inbox, RotateCcw, Sun, Type } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAreaColor } from "@/lib/areas";
import { addDays, formatFriendlyDate, formatTimeOfDay, toDateKey } from "@/lib/date";
import { parseTaskLine } from "@/lib/nlp/taskParser";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/types/planner";
import type { ParsedTask } from "@/lib/nlp/taskParser";
import type { Area, TaskPriority } from "@/types/planner";

/**
 * What the parser found is only ever a suggestion. An override records the
 * user's decision about one field: `undefined` means "keep following the text",
 * `null` means "the user cleared this on purpose".
 */
export interface FieldOverrides {
  scheduledDate?: string | null;
  timeOfDay?: string | null;
  allDay?: boolean | null;
  priority?: TaskPriority | null;
  area?: string | null;
}

export interface ResolvedFields {
  title: string;
  scheduledDate?: string;
  timeOfDay?: string;
  allDay?: boolean;
  priority?: TaskPriority;
  area?: string;
}

const TIME_PRESETS = ["09:00", "12:00", "15:00", "18:00"];

function pick<T>(override: T | null | undefined, parsed: T | undefined): T | undefined {
  if (override === undefined) {
    return parsed;
  }
  return override ?? undefined;
}

/** Folds the overrides over the parse to get the task that would be created. */
export function resolveFields(
  parsed: ParsedTask | null,
  overrides: FieldOverrides,
  defaultDate?: string,
): ResolvedFields {
  const timeOfDay = pick(overrides.timeOfDay, parsed?.timeOfDay);
  const scheduledDate = pick(overrides.scheduledDate, parsed?.scheduledDate);

  return {
    title: parsed?.title ?? "",
    // A date is only defaulted when the user hasn't deliberately cleared it.
    scheduledDate: scheduledDate ?? (overrides.scheduledDate === null ? undefined : defaultDate),
    timeOfDay,
    // A time and an all-day marker are mutually exclusive; the time wins.
    allDay: timeOfDay ? undefined : pick(overrides.allDay, parsed?.allDay),
    priority: pick(overrides.priority, parsed?.priority),
    area: pick(overrides.area, parsed?.area),
  };
}

/* ------------------------------------------------------------------ chip -- */

interface ChipProps {
  icon: typeof Type;
  label: string;
  value: string;
  /** True when nothing was detected and nothing was chosen. */
  empty?: boolean;
  tone?: string;
  /** True when the user has pinned this field, so it no longer follows the text. */
  overridden?: boolean;
  onReset?: () => void;
  children?: React.ReactNode;
}

function Chip({
  icon: Icon,
  label,
  value,
  empty,
  tone,
  overridden,
  onReset,
  children,
}: ChipProps) {
  const body = (
    <span
      className={cn(
        "flex h-7 min-w-0 max-w-52 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
        empty ? "border-dashed text-muted-foreground" : "bg-card",
        children && "hover:border-ring/60 hover:bg-accent",
        overridden && "border-ring/70 ring-1 ring-ring/25",
      )}
    >
      <Icon className="size-3 shrink-0" style={tone && !empty ? { color: tone } : undefined} />
      <span className="shrink-0 text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn("min-w-0 truncate font-medium", empty && "font-normal")}
        style={tone && !empty ? { color: tone } : undefined}
      >
        {value}
      </span>
      {overridden && onReset ? (
        <RotateCcw
          role="button"
          aria-label={`Let ${label.toLowerCase()} follow the text again`}
          className="size-3 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onReset();
          }}
        />
      ) : null}
    </span>
  );

  if (!children) {
    return body;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md">
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function PresetButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded border px-1.5 py-0.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
        active
          ? "border-ring bg-accent font-medium text-accent-foreground"
          : "border-border text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ row -- */

interface QuickAddFieldsProps {
  parsed: ParsedTask | null;
  overrides: FieldOverrides;
  setOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>;
  areas: Area[];
  defaultDate?: string;
  /** Number of lines when a multi-line paste is pending; chips are moot then. */
  pendingLines: number;
  className?: string;
}

/**
 * The detected fields, always on screen and always the same height — so the
 * board below never moves as the parse changes — and each one editable, because
 * the parser is guessing and the user is not.
 */
export function QuickAddFields({
  parsed,
  overrides,
  setOverrides,
  areas,
  defaultDate,
  pendingLines,
  className,
}: QuickAddFieldsProps) {
  const fields = resolveFields(parsed, overrides, defaultDate);
  const today = toDateKey(new Date());
  const [timeDraft, setTimeDraft] = React.useState("");

  if (pendingLines > 1) {
    return (
      <div className={cn("flex h-7 items-center", className)}>
        <span className="text-xs text-muted-foreground">
          {pendingLines} lines detected — press Enter to create them all. Fields are read from
          each line.
        </span>
      </div>
    );
  }

  const areaColor = fields.area ? getAreaColor(areas, fields.area) : undefined;
  const isNewArea = Boolean(fields.area) && !areas.some(
    (area) => area.name.toLowerCase() === fields.area?.toLowerCase(),
  );

  function set(patch: FieldOverrides) {
    setOverrides((current) => ({ ...current, ...patch }));
  }

  return (
    <div className={cn("flex h-7 min-w-0 flex-wrap items-center gap-1.5 overflow-hidden", className)}>
      <Chip
        icon={Type}
        label="Title"
        value={fields.title || "start typing…"}
        empty={!fields.title}
      />

      <Chip
        icon={fields.scheduledDate ? CalendarDays : Inbox}
        label={fields.scheduledDate ? "Date" : "Goes to"}
        value={fields.scheduledDate ? formatFriendlyDate(fields.scheduledDate) : "Pool"}
        empty={!fields.scheduledDate}
        tone="var(--nlp-date)"
        overridden={overrides.scheduledDate !== undefined}
        onReset={() => set({ scheduledDate: undefined })}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <PresetButton
              active={fields.scheduledDate === today}
              onClick={() => set({ scheduledDate: today })}
            >
              Today
            </PresetButton>
            <PresetButton
              active={fields.scheduledDate === addDays(today, 1)}
              onClick={() => set({ scheduledDate: addDays(today, 1) })}
            >
              Tomorrow
            </PresetButton>
            <PresetButton onClick={() => set({ scheduledDate: addDays(today, 7) })}>
              +1 week
            </PresetButton>
            <PresetButton
              active={overrides.scheduledDate === null}
              onClick={() => set({ scheduledDate: null })}
            >
              Pool
            </PresetButton>
          </div>
          <input
            type="date"
            aria-label="Scheduled date"
            value={fields.scheduledDate ?? ""}
            onChange={(event) => set({ scheduledDate: event.target.value || null })}
            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </Chip>

      <Chip
        icon={fields.allDay ? Sun : Clock}
        label="Time"
        value={
          fields.allDay ? "All day" : fields.timeOfDay ? formatTimeOfDay(fields.timeOfDay) : "any"
        }
        empty={!fields.timeOfDay && !fields.allDay}
        tone="var(--nlp-time)"
        overridden={overrides.timeOfDay !== undefined || overrides.allDay !== undefined}
        onReset={() => set({ timeOfDay: undefined, allDay: undefined })}
      >
        <div className="space-y-2">
          <input
            value={timeDraft}
            placeholder="3pm, 14:00-16:00…"
            aria-label="Time of day"
            onChange={(event) => setTimeDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return;
              }
              event.preventDefault();
              // Reuse the parser so anything the quick-add accepts works here.
              const time = parseTaskLine(timeDraft).timeOfDay;
              if (time) {
                set({ timeOfDay: time, allDay: null });
                setTimeDraft("");
              }
            }}
            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap gap-1">
            {TIME_PRESETS.map((preset) => (
              <PresetButton
                key={preset}
                active={fields.timeOfDay === preset}
                onClick={() => set({ timeOfDay: preset, allDay: null })}
              >
                {preset}
              </PresetButton>
            ))}
            <PresetButton
              active={fields.allDay}
              onClick={() => set({ allDay: true, timeOfDay: null })}
            >
              All day
            </PresetButton>
            <PresetButton onClick={() => set({ timeOfDay: null, allDay: null })}>
              Anytime
            </PresetButton>
          </div>
        </div>
      </Chip>

      <Chip
        icon={Flag}
        label="Priority"
        value={fields.priority ? PRIORITY_LABELS[fields.priority] : "none"}
        empty={!fields.priority}
        tone="var(--nlp-priority)"
        overridden={overrides.priority !== undefined}
        onReset={() => set({ priority: undefined })}
      >
        <div className="flex flex-wrap gap-1">
          {TASK_PRIORITIES.map((priority) => (
            <PresetButton
              key={priority}
              active={fields.priority === priority}
              onClick={() => set({ priority })}
            >
              {PRIORITY_LABELS[priority]}
            </PresetButton>
          ))}
          <PresetButton active={overrides.priority === null} onClick={() => set({ priority: null })}>
            None
          </PresetButton>
        </div>
      </Chip>

      <Chip
        icon={Hash}
        label={isNewArea ? "New area" : "Area"}
        value={fields.area ?? "none"}
        empty={!fields.area}
        tone={areaColor}
        overridden={overrides.area !== undefined}
        onReset={() => set({ area: undefined })}
      >
        <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
          {areas
            .filter((area) => !area.archived)
            .map((area) => (
              <PresetButton
                key={area.id}
                active={fields.area === area.name}
                onClick={() => set({ area: area.name })}
              >
                <span
                  aria-hidden
                  className="mr-1 inline-block size-1.5 rounded-full align-middle"
                  style={{ backgroundColor: getAreaColor(areas, area.name) }}
                />
                {area.name}
              </PresetButton>
            ))}
          <PresetButton active={overrides.area === null} onClick={() => set({ area: null })}>
            None
          </PresetButton>
        </div>
      </Chip>
    </div>
  );
}

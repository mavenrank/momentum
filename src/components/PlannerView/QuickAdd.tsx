import * as React from "react";
import { cn } from "@/lib/utils";
import { QuickAddFields, resolveFields } from "./QuickAddFields";
import type { FieldOverrides } from "./QuickAddFields";
import { fuzzyMatchAreas, getAreaColor } from "@/lib/areas";
import { parseTaskInput, parseTaskLine, toHighlightSegments } from "@/lib/nlp/taskParser";
import type { ParsedTask } from "@/lib/nlp/taskParser";
import type { Area } from "@/types/planner";

export interface QuickAddProps {
  areas: Area[];
  placeholder?: string;
  /** Applied to every task created from this input when it parsed no date. */
  defaultDate?: string;
  onCreate: (tasks: ParsedTask[]) => void;
  className?: string;
  autoFocus?: boolean;
  /** Set false in dense panels where the field row would crowd the layout. */
  showPreview?: boolean;
}

const TOKEN_CLASS: Record<string, string> = {
  area: "nlp-token nlp-area",
  priority: "nlp-token nlp-priority",
  date: "nlp-token nlp-date",
  time: "nlp-token nlp-time",
  allDay: "nlp-token nlp-time",
};

const NO_OVERRIDES: FieldOverrides = {};

export function QuickAdd({
  areas,
  placeholder = "Buy groceries tomorrow 3pm must #health",
  defaultDate,
  onCreate,
  className,
  autoFocus,
  showPreview = true,
}: QuickAddProps) {
  const [value, setValue] = React.useState("");
  const [areaQuery, setAreaQuery] = React.useState<string | null>(null);
  const [areaIndex, setAreaIndex] = React.useState(0);
  // Fields the user pinned by hand. Cleared whenever a task is created.
  const [overrides, setOverrides] = React.useState<FieldOverrides>(NO_OVERRIDES);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const mirrorRef = React.useRef<HTMLDivElement>(null);
  // The tag the user dismissed with Escape. Without this, the keyup that
  // follows Escape re-detects the same tag and reopens the dropdown.
  const dismissedTag = React.useRef<string | null>(null);

  const knownAreas = React.useMemo(
    () => areas.filter((area) => !area.archived).map((area) => area.name),
    [areas],
  );

  const isMultiLine = value.includes("\n");
  const parsed = React.useMemo<ParsedTask | null>(
    () => (value.trim() && !isMultiLine ? parseTaskLine(value, { knownAreas }) : null),
    [value, isMultiLine, knownAreas],
  );

  const areaMatches = React.useMemo(
    () => (areaQuery === null ? [] : fuzzyMatchAreas(areas, areaQuery).slice(0, 6)),
    [areaQuery, areas],
  );

  /** Detects an in-progress `#tag` immediately before the caret. */
  function refreshAreaQuery(text: string, caret: number) {
    const beforeCaret = text.slice(0, caret);
    const match = /(?:^|\s)#([\p{L}\p{N}_-]*)$/u.exec(beforeCaret);
    const tag = match ? match[1] : null;

    if (tag !== null && dismissedTag.current === tag) {
      return;
    }
    dismissedTag.current = null;

    setAreaQuery((current) => {
      // This runs on every keyup, arrow keys included. Resetting the highlight
      // unconditionally would undo the arrow-key selection the keydown just
      // made, so the index only goes back to the top when the tag text changes.
      if (current !== tag) {
        setAreaIndex(0);
      }
      return tag;
    });
  }

  function dismissAreaDropdown() {
    dismissedTag.current = areaQuery;
    setAreaQuery(null);
  }

  function completeArea(name: string) {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    const caret = input.selectionStart ?? value.length;
    const beforeCaret = value.slice(0, caret);
    const match = /(?:^|\s)#([\p{L}\p{N}_-]*)$/u.exec(beforeCaret);
    if (!match) {
      return;
    }

    const tagStart = beforeCaret.length - match[1].length - 1;
    const next = `${value.slice(0, tagStart)}#${name} ${value.slice(caret)}`;
    setValue(next);
    setAreaQuery(null);

    requestAnimationFrame(() => {
      const position = tagStart + name.length + 2;
      input.focus();
      input.setSelectionRange(position, position);
    });
  }

  function submit(keepFocus: boolean) {
    const tasks = parseTaskInput(value, { knownAreas });
    if (tasks.length === 0) {
      return;
    }

    // Overrides describe one task, so they only apply to a single-line entry.
    // A pasted list keeps whatever each of its own lines said.
    const resolved =
      tasks.length === 1
        ? [
            {
              ...tasks[0],
              ...resolveFields(tasks[0], overrides, defaultDate),
            },
          ]
        : tasks.map((task) => ({
            ...task,
            scheduledDate: task.scheduledDate ?? defaultDate,
          }));

    onCreate(resolved);

    setValue("");
    setAreaQuery(null);
    setOverrides(NO_OVERRIDES);
    dismissedTag.current = null;
    if (keepFocus) {
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (areaQuery !== null && areaMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setAreaIndex((index) => (index + 1) % areaMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setAreaIndex((index) => (index - 1 + areaMatches.length) % areaMatches.length);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        completeArea(areaMatches[areaIndex].name);
        return;
      }
      if (event.key === "Enter") {
        // If what's typed already names an area exactly, there is nothing left
        // to complete — Enter should create the task instead of feeling stuck.
        const alreadyComplete = areaMatches.some(
          (area) => area.name.toLowerCase() === areaQuery.toLowerCase(),
        );

        if (!alreadyComplete) {
          event.preventDefault();
          completeArea(areaMatches[areaIndex].name);
          return;
        }

        setAreaQuery(null);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dismissAreaDropdown();
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      // Shift+Enter creates the task and keeps the caret here for rapid entry.
      submit(event.shiftKey);
    }
  }

  // Keep the highlight overlay scrolled in step with the input.
  function syncScroll() {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  const segments = parsed ? toHighlightSegments(parsed) : [];
  const pendingLines = isMultiLine ? parseTaskInput(value, { knownAreas }).length : 0;

  return (
    <div className={cn("flex items-start gap-2", className)}>
      {/* The field is deliberately narrow: a task line is short, and the space
          it used to eat now carries the detected fields. */}
      <div className={cn("relative w-full", showPreview && "max-w-sm shrink-0")}>
        {/* The wrapper carries the field chrome. The input on top is fully
            transparent so the colored overlay beneath it stays visible — giving
            the input its own background would paint over the highlighting. */}
        <div className="relative rounded-md border border-input bg-background shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring">
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-3 text-sm"
          >
            {segments.map((segment, index) => (
              <span
                key={index}
                className={segment.kind ? TOKEN_CLASS[segment.kind] : undefined}
              >
                {segment.text}
              </span>
            ))}
          </div>

          <input
            ref={inputRef}
            value={value}
            autoFocus={autoFocus}
            placeholder={placeholder}
            spellCheck={false}
            aria-label="Quick add a task"
            onScroll={syncScroll}
            onChange={(event) => {
              setValue(event.target.value);
              refreshAreaQuery(event.target.value, event.target.selectionStart ?? 0);
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (text.includes("\n")) {
                // Keep the newlines so the batch parser can split on them.
                event.preventDefault();
                setValue((current) => `${current}${text}`.trim());
              }
            }}
            onKeyUp={(event) =>
              refreshAreaQuery(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)
            }
            onClick={(event) =>
              refreshAreaQuery(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)
            }
            onKeyDown={handleKeyDown}
            onBlur={() => window.setTimeout(() => setAreaQuery(null), 120)}
            className={cn(
              "relative h-9 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground",
              // Glyphs come from the overlay; only the caret stays visible here.
              value ? "text-transparent caret-foreground" : "text-foreground",
            )}
          />
        </div>

        {areaQuery !== null ? (
          <div className="absolute z-30 mt-1 w-64 overflow-hidden rounded-md border bg-popover p-1 shadow-md">
            {areaMatches.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Press Enter to create the area “{areaQuery}”.
              </div>
            ) : (
              <>
                {areaMatches.map((area, index) => (
                  <button
                    key={area.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      completeArea(area.name);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                      index === areaIndex && "bg-accent text-accent-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: getAreaColor(areas, area.name) }}
                    />
                    <span className="min-w-0 flex-1 truncate">{area.name}</span>
                    {index === areaIndex ? (
                      <kbd className="shrink-0 rounded border px-1 font-mono text-[0.6875rem] text-muted-foreground">
                        Tab
                      </kbd>
                    ) : null}
                  </button>
                ))}
                <p className="border-t px-2 pb-0.5 pt-1 text-[0.6875rem] text-muted-foreground">
                  ↑↓ to choose · Tab to complete · Esc to dismiss
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Always rendered at a fixed height, so the board below never shifts as
          the parse changes under the caret. */}
      {showPreview ? (
        <QuickAddFields
          className="mt-1"
          parsed={parsed}
          overrides={overrides}
          setOverrides={setOverrides}
          areas={areas}
          defaultDate={defaultDate}
          pendingLines={pendingLines}
        />
      ) : null}
    </div>
  );
}

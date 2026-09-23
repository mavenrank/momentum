import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { TaskDetailDialog } from "../PlannerView/TaskDetailDialog";
import { getAreaColor } from "@/lib/areas";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import { addDays, formatFriendlyDate, toDateKey } from "@/lib/date";
import { allTasks, ensureDaily } from "@/lib/plannerData";
import { cn } from "@/lib/utils";
import type { DailyTask, PlannerData } from "@/types/planner";

interface JournalViewProps {
  data: PlannerData;
  execute: PlannerCommandExecutor;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export function JournalView({ data, execute, selectedDate, setSelectedDate }: JournalViewProps) {
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const entry = ensureDaily(data, selectedDate);
  const tasks = React.useMemo(() => allTasks(data), [data]);

  const recentNotes = React.useMemo(
    () =>
      Object.values(data.daily)
        .filter((daily) => daily.note.trim())
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12),
    [data.daily],
  );

  /** Tasks matching the text typed after `@`, by ID or title. */
  const mentionMatches = React.useMemo(() => {
    if (mentionQuery === null) {
      return [];
    }
    const needle = mentionQuery.toLowerCase();
    return tasks
      .filter(
        (task) =>
          task.id.toLowerCase().includes(needle) ||
          task.title.toLowerCase().includes(needle) ||
          (task.summary ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [mentionQuery, tasks]);

  function writeNote(note: string) {
    execute({ type: "journal.set", date: selectedDate, note });
  }

  function refreshMentionQuery(text: string, caret: number) {
    const match = /(?:^|\s)@([\w-]*)$/.exec(text.slice(0, caret));
    setMentionQuery(match ? match[1] : null);
  }

  function insertMention(task: DailyTask) {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const caret = textarea.selectionStart;
    const before = entry.note.slice(0, caret);
    const match = /(?:^|\s)@([\w-]*)$/.exec(before);
    if (!match) {
      return;
    }

    const start = before.length - match[1].length - 1;
    const next = `${entry.note.slice(0, start)}@${task.id} ${entry.note.slice(caret)}`;
    writeNote(next);
    setMentionQuery(null);

    requestAnimationFrame(() => {
      const position = start + task.id.length + 2;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  }

  const referenced = entry.taskReferences
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is DailyTask => Boolean(task));

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Journal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatFriendlyDate(selectedDate)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            title="Previous day"
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            className="w-40"
            onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            title="Next day"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(toDateKey(new Date()))}>
            Today
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="pb-2">
            <CardTitle>Entry</CardTitle>
          </CardHeader>
          <CardContent className="relative flex min-h-0 flex-1 flex-col gap-2">
            <Textarea
              ref={textareaRef}
              value={entry.note}
              placeholder="Write the day as it actually felt. Type @ to reference a task."
              className="min-h-0 flex-1 resize-none leading-relaxed"
              onChange={(event) => {
                writeNote(event.target.value);
                refreshMentionQuery(event.target.value, event.target.selectionStart);
              }}
              onKeyUp={(event) =>
                refreshMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onClick={(event) =>
                refreshMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onKeyDown={(event) => {
                if (event.key === "Escape" && mentionQuery !== null) {
                  event.preventDefault();
                  setMentionQuery(null);
                }
              }}
            />

            {mentionQuery !== null ? (
              <div className="absolute inset-x-4 bottom-16 z-20 overflow-hidden rounded-md border shadow-lg">
                <Command shouldFilter={false}>
                  <CommandList>
                    <CommandEmpty>No matching task.</CommandEmpty>
                    <CommandGroup heading="Reference a task">
                      {mentionMatches.map((task) => (
                        <CommandItem
                          key={task.id}
                          value={task.id}
                          onSelect={() => insertMention(task)}
                        >
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: getAreaColor(data.areas, task.area) }}
                          />
                          <span className="min-w-0 flex-1 truncate">{task.title}</span>
                          <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                            {task.id}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            ) : null}

            {referenced.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
                <span className="text-xs text-muted-foreground">Referenced:</span>
                {referenced.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setDetailTaskId(task.id)}
                    title={task.title}
                    className={cn(
                      "flex max-w-56 items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs transition-colors hover:bg-accent",
                      task.status === "done" && "opacity-60",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getAreaColor(data.areas, task.area) }}
                    />
                    <span className="truncate">{task.title}</span>
                    <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                      {task.id.slice(-4)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle>Recent entries</CardTitle>
            <Badge variant="muted">{recentNotes.length}</Badge>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <ScrollArea className="h-full px-4 pb-4">
              {recentNotes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Your recent journal entries will appear here.
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                {recentNotes.map((note) => (
                  <button
                    key={note.date}
                    type="button"
                    onClick={() => setSelectedDate(note.date)}
                    className={cn(
                      "rounded-md border p-2 text-left transition-colors hover:bg-accent",
                      note.date === selectedDate && "border-ring bg-accent/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-xs">{note.date}</strong>
                      {note.taskReferences.length > 0 ? (
                        <span className="text-[0.6875rem] text-muted-foreground">
                          {note.taskReferences.length} ref
                          {note.taskReferences.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {note.note.slice(0, 180)}
                    </p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <TaskDetailDialog
        task={tasks.find((task) => task.id === detailTaskId) ?? null}
        domains={data.domains}
        areas={data.areas}
        pursuits={data.pursuits}
        allTasks={tasks}
        onClose={() => setDetailTaskId(null)}
        onSave={(taskId, patch) =>
          execute({ type: "task.update", taskId, patch, conflictPolicy: "warn" })
        }
        onDelete={(taskId) => execute({ type: "task.delete", taskId })}
      />
    </div>
  );
}

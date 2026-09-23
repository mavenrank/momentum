import * as React from "react";
import { ChevronDown, CircleDashed, Clock, Sun, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getAreaColor } from "@/lib/areas";
import { areaAcceptsPursuit, areaPath } from "@/lib/organization";
import type { PlannerCommandResult } from "@/lib/application/commands";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  SUMMARY_SOFT_LIMIT,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TITLE_SOFT_LIMIT,
  taskTiming,
} from "@/types/planner";
import type {
  Area,
  DailyTask,
  Domain,
  Pursuit,
  TaskPriority,
  TaskStatus,
  TaskTiming,
} from "@/types/planner";

const NONE = "__none__";

const TIMING_OPTIONS = [
  { value: "timed", label: "At a time", icon: Clock },
  { value: "allDay", label: "All day", icon: Sun },
  { value: "anytime", label: "Anytime", icon: CircleDashed },
] as const satisfies ReadonlyArray<{ value: TaskTiming; label: string; icon: typeof Clock }>;

const TIMING_HINTS: Record<TaskTiming, string> = {
  timed: "Starts at a specific time; sorts by the clock within its day.",
  allDay: "Runs across the whole day; sorts above timed work.",
  anytime: "Scheduled for the day with no particular time.",
};

interface TaskDetailDialogProps {
  task: DailyTask | null;
  domains: Domain[];
  areas: Area[];
  pursuits: Pursuit[];
  allTasks: DailyTask[];
  onClose: () => void;
  onSave: (taskId: string, patch: Partial<Omit<DailyTask, "id" | "createdAt">>) => PlannerCommandResult;
  onDelete: (taskId: string) => void;
}

export function TaskDetailDialog({
  task,
  domains,
  areas,
  pursuits,
  allTasks,
  onClose,
  onSave,
  onDelete,
}: TaskDetailDialogProps) {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<DailyTask | null>(task);
  // Long descriptions are rare, so the editor starts collapsed unless the task
  // already has one.
  const [bodyOpen, setBodyOpen] = React.useState(false);

  React.useEffect(() => {
    setDraft(task);
    setBodyOpen(Boolean(task?.description));
  }, [task]);

  if (!draft) {
    return null;
  }

  function update<K extends keyof DailyTask>(key: K, value: DailyTask[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function save() {
    if (!draft) {
      return;
    }

    // Emptying the date and the time is how a task is taken off the calendar,
    // so it drops back into the Pool rather than lingering as "scheduled" with
    // nothing to schedule.
    const stripped =
      !draft.scheduledDate && !draft.timeOfDay && !draft.allDay && draft.status === "scheduled";

    const result = onSave(draft.id, {
      title: draft.title.trim(),
      summary: draft.summary?.trim() || undefined,
      description: draft.description?.trim() || undefined,
      status: stripped ? "pool" : draft.status,
      priority: draft.priority,
      area: draft.area,
      domainId: draft.area ? undefined : draft.domainId,
      relatedAreaIds: draft.relatedAreaIds ?? [],
      pursuitId: draft.pursuitId,
      scheduledDate: draft.scheduledDate,
      timeOfDay: draft.timeOfDay,
      allDay: draft.timeOfDay ? undefined : draft.allDay,
    });
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }
    onClose();
  }

  const timing = taskTiming(draft);
  const selectedDomainId = draft.area ? areas.find((area) => area.id === draft.area)?.domainId : draft.domainId;

  const followUps = allTasks.filter(
    (candidate) => candidate.relationships.followUpOf === draft.id,
  );
  const parent = draft.relationships.followUpOf
    ? allTasks.find((candidate) => candidate.id === draft.relationships.followUpOf)
    : undefined;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: getAreaColor(areas, draft.area) }}
            />
            <span className="font-mono text-xs text-muted-foreground">{draft.id}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Title</span>
            <Input
              value={draft.title}
              maxLength={TITLE_SOFT_LIMIT * 2}
              onChange={(event) => update("title", event.target.value)}
            />
            {draft.title.length > TITLE_SOFT_LIMIT ? (
              <span className="text-xs text-muted-foreground">
                {draft.title.length} characters — titles read best under {TITLE_SOFT_LIMIT}.
              </span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Summary — one line, shown on the card
            </span>
            <Input
              value={draft.summary ?? ""}
              placeholder="A short clarifying line (optional)"
              maxLength={SUMMARY_SOFT_LIMIT}
              onChange={(event) => update("summary", event.target.value)}
            />
          </label>

          <Collapsible open={bodyOpen} onOpenChange={setBodyOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                <span>
                  Long description
                  {draft.description ? (
                    <span className="ml-2 text-xs normal-case text-muted-foreground">
                      {draft.description.trim().split(/\s+/).length} words
                    </span>
                  ) : (
                    <span className="ml-2 text-xs normal-case">— optional</span>
                  )}
                </span>
                <ChevronDown
                  className={cn("size-4 transition-transform duration-200", bodyOpen && "rotate-180")}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Textarea
                value={draft.description ?? ""}
                placeholder="Room for the full context — notes, links, acceptance criteria…"
                className="mt-2 min-h-48 font-mono text-sm leading-relaxed"
                onChange={(event) => update("description", event.target.value)}
              />
            </CollapsibleContent>
          </Collapsible>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <Select
                value={draft.status}
                onValueChange={(value) => update("status", value as TaskStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Priority</span>
              <Select
                value={draft.priority ?? NONE}
                onValueChange={(value) =>
                  update("priority", value === NONE ? undefined : (value as TaskPriority))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {TASK_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Domain</span>
              <Select value={selectedDomainId ?? NONE} onValueChange={(value) => setDraft((current) => current ? { ...current, domainId: value === NONE ? undefined : value, area: undefined, pursuitId: undefined } : current)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>None</SelectItem>{domains.filter((domain) => !domain.archived || domain.id === selectedDomainId).map((domain) => <SelectItem key={domain.id} value={domain.id}>{domain.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Area</span>
              <Select
                value={draft.area ?? NONE}
                onValueChange={(value) => setDraft((current) => {
                  if (!current) return current;
                  const areaId = value === NONE ? undefined : value;
                  const pursuit = pursuits.find((entry) => entry.id === current.pursuitId);
                  return { ...current, area: areaId, domainId: areaId ? undefined : selectedDomainId, pursuitId: pursuit && areaAcceptsPursuit(pursuit, areaId) ? pursuit.id : undefined };
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {areas
                    .filter((area) => area.domainId === selectedDomainId && (!area.archived || area.id === draft.area))
                    .map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}{area.archived ? " (archived)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Pursuit</span>
              <Select value={draft.pursuitId ?? NONE} onValueChange={(value) => update("pursuitId", value === NONE ? undefined : value)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {pursuits.filter((pursuit) => (pursuit.status === "active" || pursuit.id === draft.pursuitId) && areaAcceptsPursuit(pursuit, draft.area)).map((pursuit) => <SelectItem key={pursuit.id} value={pursuit.id}>{pursuit.name}{pursuit.status !== "active" ? ` (${pursuit.status.replace("_", " ")})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>

            <div className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Related Areas</span>
              <p className="text-xs text-muted-foreground">Keep one primary Area; add other Areas for cross cutting work.</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(draft.relatedAreaIds ?? []).map((id) => <button key={id} type="button" title="Remove related Area" onClick={() => update("relatedAreaIds", (draft.relatedAreaIds ?? []).filter((entry) => entry !== id))} className="rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs hover:bg-accent">{areaPath({ areas, domains }, id)} ×</button>)}
                <select value="" aria-label="Add related Area" onChange={(event) => { if (event.target.value) update("relatedAreaIds", [...(draft.relatedAreaIds ?? []), event.target.value]); }} className="h-7 rounded-md border bg-background px-2 text-xs">
                  <option value="">+ Add related Area</option>
                  {areas.filter((area) => !area.archived && area.id !== draft.area && !draft.relatedAreaIds?.includes(area.id)).map((area) => <option key={area.id} value={area.id}>{areaPath({ areas, domains }, area.id)}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Date</span>
                <Input
                  type="date"
                  value={draft.scheduledDate ?? ""}
                  onChange={(event) => update("scheduledDate", event.target.value || undefined)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Time</span>
                <Input
                  value={draft.timeOfDay ?? ""}
                  placeholder="15:00 or 14:00-16:00"
                  disabled={timing === "allDay"}
                  onChange={(event) => {
                    update("timeOfDay", event.target.value || undefined);
                    if (event.target.value) {
                      update("allDay", undefined);
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Timing</span>
            <div className="flex flex-wrap gap-1.5">
              {TIMING_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={timing === option.value ? "default" : "outline"}
                  onClick={() => {
                    if (option.value === "allDay") {
                      update("allDay", true);
                      update("timeOfDay", undefined);
                    } else if (option.value === "anytime") {
                      update("allDay", undefined);
                      update("timeOfDay", undefined);
                    } else {
                      update("allDay", undefined);
                      // Give a timed task a starting point to edit.
                      update("timeOfDay", draft.timeOfDay || "09:00");
                    }
                  }}
                >
                  <option.icon className="size-3.5" />
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{TIMING_HINTS[timing]}</p>
          </div>

          {parent || followUps.length > 0 ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              {parent ? (
                <p className="text-muted-foreground">
                  Follow-up of <span className="font-mono">{parent.id}</span> — {parent.title}
                </p>
              ) : null}
              {followUps.length > 0 ? (
                <p className="mt-1 text-muted-foreground">
                  {followUps.length} follow-up{followUps.length === 1 ? "" : "s"}:{" "}
                  {followUps.map((followUp) => followUp.id).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (window.confirm(`Delete “${draft.title}”?`)) {
                onDelete(draft.id);
                onClose();
              }
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!draft.title.trim()}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

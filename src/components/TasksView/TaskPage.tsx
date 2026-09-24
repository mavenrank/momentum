import * as React from "react";
import { ArrowLeft, Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { areaAcceptsPursuit, areaPath } from "@/lib/organization";
import { allTasks, findTask } from "@/lib/plannerData";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import { PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES } from "@/types/planner";
import type { DailyTask, PlannerData, TaskPriority, TaskStatus } from "@/types/planner";
import { TaskConnections } from "./TaskConnections";
import { TaskFollowUps } from "./TaskFollowUps";
import { TaskNearby } from "./TaskNearby";
import { TaskSchedulePanel } from "./TaskSchedulePanel";

interface TaskPageProps {
  data: PlannerData;
  execute: PlannerCommandExecutor;
  taskId: string;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenTasks: () => void;
  onOpenDay: (date: string) => void;
}

export function TaskPage(props: TaskPageProps) {
  const task = findTask(props.data, props.taskId);
  if (!task) {
    return <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-start justify-center px-4">
      <p className="font-mono text-xs text-muted-foreground">{props.taskId}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Task not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or this link may be incomplete.</p>
      <Button className="mt-6" onClick={props.onOpenTasks}>Browse all tasks</Button>
    </div>;
  }
  return <TaskDetail key={task.id} {...props} task={task} />;
}

function TaskDetail({ data, execute, task, onBack, onOpenTask, onOpenTasks, onOpenDay }: TaskPageProps & { task: DailyTask }) {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [draft, setDraft] = React.useState<DailyTask>(task);
  const tasks = React.useMemo(() => allTasks(data), [data]);
  const area = data.areas.find((entry) => entry.id === task.area);
  const domain = data.domains.find((entry) => entry.id === (area?.domainId ?? task.domainId));
  const pursuit = data.pursuits.find((entry) => entry.id === task.pursuitId);
  const accent = area?.color ?? domain?.color ?? "var(--primary)";
  const draftDomainId = draft.area ? data.areas.find((entry) => entry.id === draft.area)?.domainId : draft.domainId;

  React.useEffect(() => {
    if (!editing) setDraft(task);
  }, [task, editing]);

  React.useEffect(() => {
    if (!confirmingDelete) return;
    const timer = window.setTimeout(() => setConfirmingDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmingDelete]);

  function update<K extends keyof DailyTask>(key: K, value: DailyTask[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveEdit() {
    const result = execute({ type: "task.update", taskId: task.id, patch: {
      title: draft.title.trim(), summary: draft.summary?.trim() || undefined,
      description: draft.description?.trim() || undefined, status: draft.status,
      priority: draft.priority, area: draft.area, domainId: draft.area ? undefined : draft.domainId,
      relatedAreaIds: draft.relatedAreaIds ?? [], pursuitId: draft.pursuitId,
    } });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    setEditing(false);
    toast("Task updated.");
  }

  function toggleDone() {
    const result = execute({ type: "task.toggleDone", taskId: task.id });
    if (!result.ok) toast(result.error.message, "error");
  }

  function deleteTask() {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    const result = execute({ type: "task.delete", taskId: task.id });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    onOpenTasks();
    toast("Task deleted.");
  }

  return <div className="mx-auto max-w-7xl px-2 pb-12 pt-1 sm:px-5 sm:pt-3">
    <div className="mb-3 flex items-center">
      <Button variant="ghost" size="icon" aria-label="Back to previous view" title="Back" onClick={onBack}><ArrowLeft className="size-5" /></Button>
    </div>

    <header className="relative overflow-hidden rounded-xl border-l-[7px] px-5 py-5 sm:px-7 sm:py-6" style={{ borderColor: accent, background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 28%, var(--background)) 0%, color-mix(in srgb, ${accent} 11%, var(--background)) 55%, var(--background) 100%)` }}>
      <div className="grid min-w-0 gap-5 min-[520px]:grid-cols-[minmax(0,1fr)_9rem] min-[520px]:items-start sm:grid-cols-[minmax(0,1fr)_10.5rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground"><span>Task</span><span aria-hidden>·</span><span className="font-mono">{task.id}</span></div>
          {editing ? <label className="mt-3 block"><span className="sr-only">Task title</span><Input autoFocus value={draft.title} onChange={(event) => update("title", event.target.value)} className="h-auto min-h-12 bg-background/80 py-2 text-xl font-semibold sm:text-2xl" /></label>
            : <h1 title={task.title} className="mt-2 line-clamp-2 break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-[2.15rem]">{task.title}</h1>}
          {editing ? <label className="mt-3 block"><span className="sr-only">Task summary</span><Input value={draft.summary ?? ""} onChange={(event) => update("summary", event.target.value)} placeholder="Add a short summary" className="bg-background/80" /></label>
            : task.summary ? <p className="mt-3 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{task.summary}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2 min-[520px]:flex-col">
          {editing ? <><Button size="sm" disabled={!draft.title.trim()} onClick={saveEdit}><Check className="size-4" />Save changes</Button><Button size="sm" variant="outline" onClick={() => { setDraft(task); setEditing(false); }}><X className="size-4" />Cancel</Button></>
            : <><Button size="sm" variant={task.status === "done" ? "outline" : "default"} onClick={toggleDone}>{task.status === "done" ? <RotateCcw className="size-4" /> : <Check className="size-4" />}{task.status === "done" ? "Reopen" : "Complete"}</Button><Button size="sm" variant="outline" onClick={() => { setDraft(task); setEditing(true); }}><Pencil className="size-4" />Edit task</Button></>}
        </div>
      </div>
    </header>

    {editing ? <section className="mt-4 grid gap-4 rounded-xl border bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Edit task details">
      <EditorSelect label="Status" value={draft.status} onChange={(value) => update("status", value as TaskStatus)} options={TASK_STATUSES.map((status) => [status, STATUS_LABELS[status]])} />
      <EditorSelect label="Priority" value={draft.priority ?? ""} onChange={(value) => update("priority", value ? value as TaskPriority : undefined)} options={[["", "None"], ...TASK_PRIORITIES.map((priority): [string, string] => [priority, PRIORITY_LABELS[priority]])]} />
      <EditorSelect label="Domain" value={draftDomainId ?? ""} onChange={(value) => setDraft((current) => ({ ...current, domainId: value || undefined, area: undefined, pursuitId: undefined }))} options={[["", "None"], ...data.domains.filter((entry) => !entry.archived || entry.id === draftDomainId).map((entry): [string, string] => [entry.id, entry.name])]} />
      <EditorSelect label="Primary Area" value={draft.area ?? ""} onChange={(value) => setDraft((current) => { const areaId = value || undefined; const currentPursuit = data.pursuits.find((entry) => entry.id === current.pursuitId); return { ...current, area: areaId, domainId: areaId ? undefined : draftDomainId, pursuitId: currentPursuit && areaAcceptsPursuit(currentPursuit, areaId) ? currentPursuit.id : undefined }; })} options={[["", "None"], ...data.areas.filter((entry) => entry.domainId === draftDomainId && (!entry.archived || entry.id === draft.area)).map((entry): [string, string] => [entry.id, entry.name])]} />
      <EditorSelect label="Pursuit" value={draft.pursuitId ?? ""} onChange={(value) => update("pursuitId", value || undefined)} options={[["", "None"], ...data.pursuits.filter((entry) => (entry.status === "active" || entry.id === draft.pursuitId) && areaAcceptsPursuit(entry, draft.area)).map((entry): [string, string] => [entry.id, entry.name])]} />
      <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Related Areas</p><div className="mt-1 flex min-h-9 flex-wrap items-center gap-1.5">{(draft.relatedAreaIds ?? []).map((id) => <button key={id} type="button" onClick={() => update("relatedAreaIds", draft.relatedAreaIds?.filter((entry) => entry !== id))} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">{areaPath(data, id) ?? "Unknown Area"} ×</button>)}<select aria-label="Add related Area" value="" onChange={(event) => { if (event.target.value) update("relatedAreaIds", [...(draft.relatedAreaIds ?? []), event.target.value]); }} className="h-8 max-w-full rounded-md border bg-background px-2 text-xs"><option value="">+ Add Area</option>{data.areas.filter((entry) => !entry.archived && entry.id !== draft.area && !draft.relatedAreaIds?.includes(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{areaPath(data, entry.id)}</option>)}</select></div></div>
    </section> : <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b pb-4 text-xs sm:grid-cols-3 lg:grid-cols-5">
      <Meta label="Status" value={STATUS_LABELS[task.status]} />
      <Meta label="Priority" value={task.priority ? PRIORITY_LABELS[task.priority] : "None"} />
      <Meta label="Scheduled" value={task.scheduledDate ? `${task.scheduledDate}${task.allDay ? " · All day" : task.timeOfDay ? ` · ${task.timeOfDay}` : ""}` : "No date"} />
      <Meta label="Area" value={area ? areaPath(data, area.id) ?? area.name : domain?.name ?? "Unassigned"} />
      <Meta label="Pursuit" value={pursuit ? `${pursuit.name} · ${areaPath(data, pursuit.homeAreaId) ?? "Unknown Area"}` : "None"} />
    </div>}

    <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_18.5rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <section className="border-b pb-5" aria-label="Description">
          <h2 className="text-sm font-semibold">Details</h2>
          {editing ? <Textarea value={draft.description ?? ""} onChange={(event) => update("description", event.target.value)} placeholder="Notes, links, context, or what done looks like…" className="mt-2 min-h-48 bg-card/50 text-sm leading-6" />
            : task.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{task.description}</p>
              : <button type="button" onClick={() => { setDraft(task); setEditing(true); }} className="mt-2 text-left text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Add notes, context, or a link</button>}
        </section>
        <TaskFollowUps task={task} tasks={tasks} execute={execute} onOpenTask={onOpenTask} />
        <TaskConnections task={task} tasks={tasks} execute={execute} onOpenTask={onOpenTask} />
        <TaskNearby task={task} tasks={tasks} data={data} onOpenTask={onOpenTask} onOpenTasks={onOpenTasks} />
        {(task.relatedAreaIds?.length ?? 0) > 0 ? <section className="border-t pt-4"><h2 className="text-sm font-semibold">Related Areas</h2><p className="mt-2 text-xs text-muted-foreground">{task.relatedAreaIds!.map((id) => areaPath(data, id) ?? "Unknown Area").join(" · ")}</p></section> : null}
      </div>
      <aside className="space-y-4" aria-label="Task schedule and history">
        <TaskSchedulePanel task={task} execute={execute} onOpenDay={onOpenDay} />
        <div className="px-1 text-[11px] leading-5 text-muted-foreground"><p>Created {task.createdAt.slice(0, 10)}</p><p>Updated {task.updatedAt.slice(0, 10)}</p>{task.completedAt ? <p>Completed {task.completedAt.slice(0, 10)}</p> : null}</div>
        <Button size="sm" variant={confirmingDelete ? "destructive" : "ghost"} onClick={deleteTask} className={confirmingDelete ? "" : "text-destructive hover:text-destructive"}><Trash2 className="size-3.5" />{confirmingDelete ? "Confirm delete" : "Delete task"}</Button>
      </aside>
    </div>
  </div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-muted-foreground">{label}</p><p className="mt-0.5 truncate font-medium" title={value}>{value}</p></div>;
}

function EditorSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="min-w-0 text-xs font-medium text-muted-foreground">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

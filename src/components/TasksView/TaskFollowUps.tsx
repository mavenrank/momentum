import * as React from "react";
import { ArrowUpRight, Check, Pencil, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import { STATUS_LABELS, TASK_STATUSES } from "@/types/planner";
import type { DailyTask, TaskStatus } from "@/types/planner";

export function TaskFollowUps({ task, tasks, execute, onOpenTask }: { task: DailyTask; tasks: DailyTask[]; execute: PlannerCommandExecutor; onOpenTask: (id: string) => void }) {
  const { toast } = useToast();
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");
  const parent = tasks.find((entry) => entry.id === task.relationships.followUpOf);
  const children = tasks.filter((entry) => entry.relationships.followUpOf === task.id)
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.scheduledDate ?? "9999").localeCompare(b.scheduledDate ?? "9999") || a.createdAt.localeCompare(b.createdAt));

  function create(event: React.FormEvent) {
    event.preventDefault();
    const result = execute({ type: "task.createFollowUp", parentId: task.id, title: title.trim(), scheduledDate: date || undefined, conflictPolicy: "warn" });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    setAdding(false);
    setTitle("");
    setDate("");
    toast(result.warnings[0]?.message ?? "Follow-up added.");
  }

  return <section className="rounded-xl border bg-card/30 p-4 sm:p-5" aria-label="Follow-ups">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-sm font-semibold">Follow-ups <span className="ml-1 font-normal text-muted-foreground">{children.length}</span></h2><p className="mt-1 text-xs text-muted-foreground">Next steps connected to this task.</p></div>
      <Button variant="outline" size="sm" onClick={() => setAdding((current) => !current)}><Plus className="size-3.5" />Add follow-up</Button>
    </div>

    {parent ? <button type="button" onClick={() => onOpenTask(parent.id)} className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-left text-xs hover:bg-accent/40"><span className="min-w-0"><span className="block text-[11px] text-muted-foreground">Follows up on</span><span className="block truncate font-medium">{parent.title}</span></span><ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" /></button> : task.relationships.followUpOf ? <p className="mt-4 text-xs text-muted-foreground">Original task {task.relationships.followUpOf} is missing.</p> : null}

    {adding ? <form onSubmit={create} className="mt-4 rounded-lg border bg-background/70 p-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]"><Input autoFocus aria-label="New follow-up title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to happen next?" /><Input type="date" aria-label="New follow-up date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="mt-2 flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">Leave the date empty to keep it in the Pool.</p><div className="flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" size="sm" disabled={!title.trim()}>Create</Button></div></div></form> : null}

    <div className="mt-3 divide-y divide-border/70">
      {children.length ? children.map((child) => <FollowUpRow key={child.id} task={child} execute={execute} onOpen={() => onOpenTask(child.id)} />) : <p className="py-3 text-xs text-muted-foreground">No follow-ups yet.</p>}
    </div>
  </section>;
}

function FollowUpRow({ task, execute, onOpen }: { task: DailyTask; execute: PlannerCommandExecutor; onOpen: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(task.title);
  const [date, setDate] = React.useState(task.scheduledDate ?? "");
  const [status, setStatus] = React.useState<TaskStatus>(task.status);

  React.useEffect(() => {
    if (editing) return;
    setTitle(task.title);
    setDate(task.scheduledDate ?? "");
    setStatus(task.status);
  }, [task, editing]);

  function changeDate(value: string) {
    setDate(value);
    if (status === "pool" && value) setStatus("scheduled");
    if (status === "scheduled" && !value) setStatus("pool");
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const result = execute({ type: "task.update", taskId: task.id, patch: {
      title: title.trim(), scheduledDate: date || undefined, status,
      ...(date ? {} : { timeOfDay: undefined, allDay: undefined }),
    }, conflictPolicy: "warn" });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    setEditing(false);
    toast(result.warnings[0]?.message ?? "Follow-up updated.");
  }

  function toggleDone() {
    const result = execute({ type: "task.toggleDone", taskId: task.id });
    if (!result.ok) toast(result.error.message, "error");
  }

  return <div className="py-3">
    {editing ? <form onSubmit={save} className="grid gap-2"><Input autoFocus aria-label="Follow-up title" value={title} onChange={(event) => setTitle(event.target.value)} /><div className="flex flex-wrap items-center gap-2"><Input type="date" aria-label="Follow-up date" value={date} onChange={(event) => changeDate(event.target.value)} className="w-40" /><select aria-label="Follow-up status" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} className="h-9 rounded-md border bg-background px-2 text-sm">{TASK_STATUSES.map((entry) => <option key={entry} value={entry}>{STATUS_LABELS[entry]}</option>)}</select><div className="ml-auto flex gap-1"><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}><X className="size-3.5" />Cancel</Button><Button size="sm" type="submit" disabled={!title.trim()}><Check className="size-3.5" />Save</Button></div></div></form> : <div className="flex items-center gap-2"><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left hover:underline"><span className={`block truncate text-sm font-medium ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{STATUS_LABELS[task.status]} · {task.scheduledDate ?? "Pool"} · {task.id}</span></button><button type="button" onClick={() => { setTitle(task.title); setDate(task.scheduledDate ?? ""); setStatus(task.status); setEditing(true); }} aria-label={`Edit follow-up ${task.title}`} title="Edit follow-up" className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="size-3.5" /></button><button type="button" onClick={toggleDone} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} title={task.status === "done" ? "Reopen" : "Complete"} className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">{task.status === "done" ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}</button><button type="button" onClick={onOpen} aria-label={`Open ${task.title}`} title="Open full task" className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowUpRight className="size-3.5" /></button></div>}
  </div>;
}

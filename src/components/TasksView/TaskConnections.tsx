import * as React from "react";
import { ArrowUpRight, Link2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import type { DailyTask } from "@/types/planner";

export function TaskConnections({ task, tasks, execute, onOpenTask }: { task: DailyTask; tasks: DailyTask[]; execute: PlannerCommandExecutor; onOpenTask: (id: string) => void }) {
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const byId = React.useMemo(() => new Map(tasks.map((entry) => [entry.id, entry])), [tasks]);
  const relatedIds = [...new Set([...task.relationships.related, ...tasks.filter((entry) => entry.relationships.related.includes(task.id)).map((entry) => entry.id)])];
  const entries = [
    ...relatedIds.map((id) => ({ id, label: "Related", removable: true })),
    ...task.relationships.dependsOn.map((id) => ({ id, label: "Depends on", removable: false })),
    ...task.relationships.blocks.map((id) => ({ id, label: "Blocks", removable: false })),
  ];
  const search = query.trim().toLocaleLowerCase();
  const matches = search ? tasks.filter((entry) => entry.id !== task.id && !relatedIds.includes(entry.id) && `${entry.title} ${entry.id}`.toLocaleLowerCase().includes(search)).slice(0, 6) : [];

  function link(otherTaskId: string) {
    const result = execute({ type: "task.linkRelated", taskId: task.id, otherTaskId });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    setQuery("");
    setAdding(false);
    toast("Tasks linked.");
  }

  function unlink(otherTaskId: string) {
    const result = execute({ type: "task.unlinkRelated", taskId: task.id, otherTaskId });
    if (!result.ok) toast(result.error.message, "error");
  }

  return <section className="border-t pt-5" aria-label="Connected tasks">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Related tasks</h2><p className="mt-1 text-xs text-muted-foreground">Dependencies and other connected work.</p></div><Button variant="outline" size="sm" onClick={() => setAdding((value) => !value)}><Plus className="size-3.5" />Link task</Button></div>
    {adding ? <div className="mt-3 rounded-lg border bg-card/60 p-3"><Input autoFocus aria-label="Find a task to link" placeholder="Search by task name or ID" value={query} onChange={(event) => setQuery(event.target.value)} />{search ? <div className="mt-2 divide-y">{matches.length ? matches.map((entry) => <button key={entry.id} type="button" onClick={() => link(entry.id)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-primary"><span className="min-w-0 truncate">{entry.title}<span className="ml-2 font-mono text-xs text-muted-foreground">{entry.id}</span></span><Link2 className="size-4 shrink-0" /></button>) : <p className="py-3 text-xs text-muted-foreground">No matching tasks.</p>}</div> : <p className="mt-2 text-xs text-muted-foreground">Type a name or task ID to find a link.</p>}</div> : null}
    <div className="mt-3 divide-y rounded-lg border">{entries.length ? entries.map(({ id, label, removable }, index) => {
      const linked = byId.get(id);
      return <div key={`${label}-${id}-${index}`} className="flex items-center gap-2 px-3 py-3"><button type="button" disabled={!linked} onClick={() => onOpenTask(id)} className="group min-w-0 flex-1 text-left disabled:cursor-default"><span className="block text-[11px] text-muted-foreground">{label}</span><span className="mt-0.5 flex items-center gap-1 truncate text-sm group-hover:underline">{linked?.title ?? `Missing task ${id}`}<ArrowUpRight className="size-3 shrink-0 opacity-0 group-hover:opacity-100" /></span></button>{removable ? <button type="button" aria-label={`Unlink ${linked?.title ?? id}`} title="Remove link" onClick={() => unlink(id)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button> : null}</div>;
    }) : <p className="px-3 py-4 text-xs text-muted-foreground">No tasks linked yet. Add one when this work connects to another task.</p>}</div>
  </section>;
}

import * as React from "react";
import { Archive, Check, Pause, Play, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getAreaColor } from "@/lib/areas";
import { areaPath, sortDomainsForDisplay } from "@/lib/organization";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import { allTasks } from "@/lib/plannerData";
import type { PlannerData, Pursuit } from "@/types/planner";

type Filter = "open" | "all" | "done";

export function PursuitsView({ data, execute, onOpenTask }: { data: PlannerData; execute: PlannerCommandExecutor; onOpenTask: (taskId: string) => void }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showAreaTasks, setShowAreaTasks] = React.useState(true);
  const [domainId, setDomainId] = React.useState<string | null>(null);
  const [areaId, setAreaId] = React.useState<string | null>(null);
  const [newArea, setNewArea] = React.useState("");
  const [name, setName] = React.useState("");
  const [newTask, setNewTask] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("open");
  const [showArchived, setShowArchived] = React.useState(false);
  const tasks = React.useMemo(() => allTasks(data), [data]);
  const domains = sortDomainsForDisplay(data.domains).filter((domain) => showArchived || !domain.archived || domain.id === domainId);
  const domain = domains.find((entry) => entry.id === domainId) ?? domains[0];
  const areas = data.areas.filter((entry) => entry.domainId === domain?.id && (showArchived || !entry.archived || entry.id === areaId));
  const area = areas.find((entry) => entry.id === areaId) ?? areas[0];
  const visiblePursuits = data.pursuits.filter((pursuit) => area && (pursuit.homeAreaId === area.id || pursuit.participatingAreaIds.includes(area.id)) && (showArchived || pursuit.status !== "archived"));
  const selected = showAreaTasks ? undefined : visiblePursuits.find((pursuit) => pursuit.id === selectedId) ?? visiblePursuits[0];
  const directTasks = tasks.filter((task) => task.area === area?.id && !task.pursuitId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const relatedAreaTasks = tasks.filter((task) => task.relatedAreaIds?.includes(area?.id ?? "")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const related = tasks
    .filter((task) => task.pursuitId === selected?.id)
    .filter((task) => filter === "all" || (filter === "done" ? task.status === "done" : task.status !== "done"))
    .filter((task) => `${task.title} ${task.summary ?? ""} ${task.description ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function createPursuit() {
    if (!area) return;
    const result = execute({ type: "pursuit.create", name, homeAreaId: area.id });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    setSelectedId((result.value as { id: string }).id);
    setShowAreaTasks(false);
    setName("");
  }

  function updatePursuit(patch: Partial<Pick<Pursuit, "name" | "homeAreaId" | "participatingAreaIds" | "status">>) {
    if (!selected) return;
    const result = execute({ type: "pursuit.update", pursuitId: selected.id, patch });
    if (!result.ok) toast(result.error.message, "error");
  }

  function createTask() {
    if (!selected || !newTask.trim()) return;
    const result = execute({ type: "task.create", input: { title: newTask.trim(), area: area?.id, pursuitId: selected.id } });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    setNewTask("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Pursuits</h2>
        <p className="mt-1 text-sm text-muted-foreground">Browse from broad Domains to specific work, across every date.</p>
        {data.domains.some((entry) => entry.archived) || data.areas.some((entry) => entry.archived) || data.pursuits.some((entry) => entry.status === "archived") ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowArchived((current) => !current)}>{showArchived ? "Hide archived" : "Show archived"}</Button> : null}
      </header>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[11rem_13rem_15rem_minmax(0,1fr)]">
        <section className="border-b p-2 lg:border-b-0 lg:border-r" aria-label="Domains">
          <h3 className="px-2 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Domains</h3>
          <div className="flex gap-1 overflow-x-auto lg:flex-col">{domains.map((entry) => <button key={entry.id} type="button" onClick={() => { setDomainId(entry.id); setAreaId(null); setSelectedId(null); setShowAreaTasks(true); }}
            className="flex min-w-28 items-center gap-2 rounded-md border px-3 py-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full"
            style={entry.id === domain?.id ? { backgroundColor: `${entry.color}22`, borderColor: `${entry.color}80` } : { borderColor: "transparent" }}>
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} />{entry.name}{entry.archived ? <span className="ml-auto text-[0.65rem] text-muted-foreground">archived</span> : null}</button>)}</div>
        </section>
        <section className="border-b p-2 lg:border-b-0 lg:border-r" aria-label="Areas">
          <h3 className="px-2 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Areas</h3>
          <div className="space-y-1">{areas.map((entry) => <button key={entry.id} type="button" onClick={() => { setAreaId(entry.id); setSelectedId(null); setShowAreaTasks(true); }}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent/70 ${entry.id === area?.id ? "bg-accent font-medium" : ""}`}
            style={{ boxShadow: `inset 3px 0 ${entry.color}`, backgroundColor: `${entry.color}${entry.id === area?.id ? "28" : "10"}` }}>
            <span className="truncate">{entry.name}{entry.archived ? <span className="ml-1 text-[0.65rem] text-muted-foreground">archived</span> : null}</span><span className="font-mono text-xs text-muted-foreground">{tasks.filter((task) => task.area === entry.id).length}</span></button>)}</div>
          {domain && !domain.archived ? <form className="mt-3 flex gap-1" onSubmit={(event) => { event.preventDefault(); if (!newArea.trim()) return; const result = execute({ type: "area.create", name: newArea.trim(), domainId: domain.id }); if (!result.ok) toast(result.error.message, "error"); else { setAreaId((result.value as { id: string }).id); setNewArea(""); } }}>
            <Input value={newArea} onChange={(event) => setNewArea(event.target.value)} placeholder="New area" aria-label="New area" className="min-w-0" /><Button size="icon" variant="outline" disabled={!newArea.trim()} aria-label="Add area"><Plus className="size-4" /></Button>
          </form> : null}
        </section>
        <Card className="min-h-0 rounded-none border-0 border-b shadow-none lg:border-b-0 lg:border-r">
          <CardHeader className="pb-2"><CardTitle>Pursuits</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); createPursuit(); }}>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New pursuit" aria-label="New pursuit name" />
              <Button type="submit" size="icon" disabled={!name.trim() || !area || area.archived} aria-label="Add pursuit"><Plus className="size-4" /></Button>
            </form>
            <div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {visiblePursuits.map((pursuit) => {
                const count = tasks.filter((task) => task.pursuitId === pursuit.id).length;
                return <button key={pursuit.id} type="button" onClick={() => { setSelectedId(pursuit.id); setShowAreaTasks(false); setFilter("open"); setQuery(""); }}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${selected?.id === pursuit.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}>
                  <span className="min-w-0 truncate">{pursuit.name}<span className="block text-[0.68rem] text-muted-foreground">{pursuit.homeAreaId === area?.id ? pursuit.status.replace("_", " ") : `From ${areaPath(data, pursuit.homeAreaId)}`}</span></span>
                  <span className="ml-2 text-xs text-muted-foreground">{count}</span>
                </button>;
              })}
            </div>
          </CardContent>
        </Card>
        <Card className="min-h-0 rounded-none border-0 shadow-none">
          {selected ? <>
            <CardHeader className="space-y-3 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{selected.name}</CardTitle>
                <div className="flex gap-1">
                  {selected.status === "active" ? <Button variant="outline" size="sm" onClick={() => updatePursuit({ status: "on_hold" })}><Pause className="size-3.5" />Hold</Button>
                    : <Button variant="outline" size="sm" onClick={() => updatePursuit({ status: "active" })}><Play className="size-3.5" />Resume</Button>}
                  {selected.status !== "completed" ? <Button variant="outline" size="sm" onClick={() => updatePursuit({ status: "completed" })}><Check className="size-3.5" />Complete</Button> : null}
                  {selected.status !== "archived" ? <Button variant="outline" size="sm" onClick={() => updatePursuit({ status: "archived" })}><Archive className="size-3.5" />Archive</Button> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input defaultValue={selected.name} key={selected.id} className="max-w-64" aria-label="Pursuit name" onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== selected.name) updatePursuit({ name: next }); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={selected.homeAreaId} onChange={(event) => updatePursuit({ homeAreaId: event.target.value })} aria-label="Home area">
                  {data.areas.filter((entry) => !entry.archived || entry.id === selected.homeAreaId).map((entry) => <option key={entry.id} value={entry.id}>{areaPath(data, entry.id)}{entry.archived ? " (archived)" : ""}</option>)}
                </select>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-xs">
                <p className="font-medium">Also participates in</p><p className="mt-0.5 text-muted-foreground">Add another Area when this Pursuit has work there.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{selected.participatingAreaIds.map((id) => <button key={id} type="button" title="Remove participating Area" className="rounded-full border bg-background px-2 py-1 hover:bg-accent" onClick={() => updatePursuit({ participatingAreaIds: selected.participatingAreaIds.filter((entry) => entry !== id) })}>{areaPath(data, id)} ×</button>)}
                  <select className="h-7 rounded-md border bg-background px-2 text-xs" value="" aria-label="Add participating Area" onChange={(event) => { if (event.target.value) updatePursuit({ participatingAreaIds: [...selected.participatingAreaIds, event.target.value] }); }}><option value="">+ Add Area</option>{data.areas.filter((entry) => !entry.archived && entry.id !== selected.homeAreaId && !selected.participatingAreaIds.includes(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{areaPath(data, entry.id)}</option>)}</select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected.status === "active" ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); createTask(); }}>
                <Input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add a task to this pursuit" aria-label="New pursuit task" />
                <Button type="submit" disabled={!newTask.trim()}><Plus className="size-4" />Add</Button>
              </form> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks across all dates" className="max-w-sm" aria-label="Search pursuit tasks" />
                {(["open", "all", "done"] as const).map((choice) => <Button key={choice} variant={filter === choice ? "default" : "outline"} size="sm" onClick={() => setFilter(choice)}>{choice === "done" ? "Completed" : choice === "open" ? "Open" : "All"}</Button>)}
              </div>
              <div className="max-h-[57vh] space-y-1 overflow-y-auto">
                {related.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No matching tasks.</p> : related.map((task) => <button key={task.id} type="button" onClick={() => onOpenTask(task.id)} className="flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left hover:bg-accent/50">
                  <span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: getAreaColor(data.areas, task.area) }} />
                  <span className="min-w-0 flex-1"><span className={task.status === "done" ? "text-sm line-through text-muted-foreground" : "text-sm"}>{task.title}</span><span className="block text-xs text-muted-foreground">{areaPath(data, task.area) ?? "No Area"} · created {task.createdAt.slice(0, 10)} · {task.status}</span></span>
                </button>)}
              </div>
            </CardContent>
          </> : area ? <CardContent className="space-y-4 pt-5">
            <div><p className="text-xs text-muted-foreground">{areaPath(data, area.id)}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{area.name}</h2><p className="mt-1 text-sm text-muted-foreground">{tasks.filter((task) => task.area === area.id).length} primary · {relatedAreaTasks.length} related · {visiblePursuits.length} Pursuits</p></div>
            <div className="border-t pt-4"><h3 className="text-sm font-medium">Tasks without a Pursuit</h3><p className="mt-1 text-xs text-muted-foreground">Use an Area directly for ongoing responsibilities. Start a Pursuit when a particular effort needs its own timeline.</p></div>
            {!area.archived && !domain?.archived ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!newTask.trim()) return; const result = execute({ type: "task.create", input: { title: newTask.trim(), area: area.id } }); if (!result.ok) toast(result.error.message, "error"); else setNewTask(""); }}><Input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add a task to this Area" aria-label="New Area task" /><Button type="submit" disabled={!newTask.trim()}><Plus className="size-4" />Add</Button></form> : null}
            <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">{directTasks.length ? directTasks.map((task) => <button key={task.id} type="button" onClick={() => onOpenTask(task.id)} className="flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/50"><span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: area.color }} /><span className="min-w-0 flex-1"><span className={task.status === "done" ? "line-through text-muted-foreground" : ""}>{task.title}</span><span className="block text-xs text-muted-foreground">{task.scheduledDate ?? "Pool"} · {task.status}</span></span></button>) : <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No direct tasks here yet.</div>}</div>
            {relatedAreaTasks.length ? <div className="border-t pt-4"><h3 className="text-sm font-medium">Related from other Areas</h3><div className="mt-2 max-h-[30vh] space-y-1 overflow-y-auto pr-1">{relatedAreaTasks.map((task) => <button key={task.id} type="button" onClick={() => onOpenTask(task.id)} className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/50"><span className={task.status === "done" ? "line-through text-muted-foreground" : ""}>{task.title}</span><span className="block text-xs text-muted-foreground">Primary: {areaPath(data, task.area) ?? data.domains.find((entry) => entry.id === task.domainId)?.name ?? "Unassigned"} · {task.status}</span></button>)}</div></div> : null}
          </CardContent> : <CardContent className="py-16 text-center text-sm text-muted-foreground">Choose a Domain and Area to begin.</CardContent>}
        </Card>
      </div>
    </div>
  );
}

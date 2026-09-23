import * as React from "react";
import { Archive, CircleCheck, Pause, Play, Plus, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import { areaPath } from "@/lib/organization";
import { allTasks } from "@/lib/plannerData";
import type { PlannerData, Pursuit } from "@/types/planner";

const statusLabels = { active: "Active", on_hold: "On hold", completed: "Completed", archived: "Archived" } as const;

export function PursuitSettings({ data, execute }: { data: PlannerData; execute: PlannerCommandExecutor }) {
  const { toast } = useToast();
  const tasks = React.useMemo(() => allTasks(data), [data]);
  const [showArchived, setShowArchived] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newHomeAreaId, setNewHomeAreaId] = React.useState("");
  const availableAreas = data.areas.filter((area) => !area.archived && data.domains.some((domain) => domain.id === area.domainId && !domain.archived));
  const pursuits = data.pursuits.filter((entry) => showArchived || entry.status !== "archived")
    .sort((a, b) => a.name.localeCompare(b.name));

  function update(pursuit: Pursuit, patch: Partial<Pick<Pursuit, "name" | "homeAreaId" | "participatingAreaIds" | "status">>) {
    const result = execute({ type: "pursuit.update", pursuitId: pursuit.id, patch });
    if (!result.ok) toast(result.error.message, "error");
  }

  function create(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    const homeAreaId = newHomeAreaId || availableAreas[0]?.id;
    if (!name || !homeAreaId) return;
    const result = execute({ type: "pursuit.create", name, homeAreaId });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    setNewName("");
    toast(`Pursuit “${name}” added.`);
  }

  return <div className="space-y-4">
    <div className="rounded-lg border bg-muted/25 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
      <strong className="text-foreground">A Pursuit collects one focused effort over time.</strong> It needs a home Area. Add participating Areas when the effort has tasks whose primary home is elsewhere. The same name can be used in different home Areas.
    </div>
    <Card><CardContent className="pt-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <label className="min-w-44 flex-1 space-y-1 text-xs text-muted-foreground"><span>Pursuit name</span><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="A specific effort" aria-label="New Pursuit name" /></label>
        <label className="min-w-44 flex-1 space-y-1 text-xs text-muted-foreground"><span>Home Area</span><select value={newHomeAreaId || availableAreas[0]?.id || ""} onChange={(event) => setNewHomeAreaId(event.target.value)} aria-label="Home Area for new Pursuit" className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">
          {availableAreas.map((area) => <option key={area.id} value={area.id}>{areaPath(data, area.id)}</option>)}
        </select></label>
        <Button type="submit" disabled={!newName.trim() || availableAreas.length === 0}><Plus className="size-4" />Add Pursuit</Button>
      </form>
      {availableAreas.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Create or restore an Area before adding a Pursuit.</p> : null}
    </CardContent></Card>
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{data.pursuits.filter((entry) => entry.status !== "archived").length} current · {data.pursuits.filter((entry) => entry.status === "archived").length} archived</p>
      {data.pursuits.some((entry) => entry.status === "archived") ? <Button variant="ghost" size="sm" onClick={() => setShowArchived((current) => !current)}>{showArchived ? "Hide archived" : "Show archived"}</Button> : null}
    </div>
    {pursuits.length ? <div className="space-y-3">{pursuits.map((pursuit) => {
      const count = tasks.filter((task) => task.pursuitId === pursuit.id).length;
      const open = tasks.filter((task) => task.pursuitId === pursuit.id && task.status !== "done").length;
      const home = data.areas.find((area) => area.id === pursuit.homeAreaId);
      return <Card key={pursuit.id} className={pursuit.status === "archived" ? "opacity-70" : undefined}>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <input key={`${pursuit.id}-${pursuit.name}`} defaultValue={pursuit.name} aria-label={`Rename ${pursuit.name}`} className="w-full min-w-0 bg-transparent text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring" onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== pursuit.name) update(pursuit, { name }); else event.target.value = pursuit.name; }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              <p className="mt-1 text-xs text-muted-foreground">{count} task{count === 1 ? "" : "s"}{open ? ` · ${open} open` : ""}</p>
            </div>
            <Badge variant="muted">{statusLabels[pursuit.status]}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="space-y-1 text-xs text-muted-foreground"><span>Home Area</span>
              <select value={pursuit.homeAreaId} onChange={(event) => update(pursuit, { homeAreaId: event.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">
                {data.areas.filter((area) => !area.archived || area.id === pursuit.homeAreaId).map((area) => <option key={area.id} value={area.id}>{areaPath(data, area.id)}{area.archived ? " (archived)" : ""}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground"><span>Add participating Area</span>
              <select value="" onChange={(event) => { if (event.target.value) update(pursuit, { participatingAreaIds: [...pursuit.participatingAreaIds, event.target.value] }); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">
                <option value="">Choose another Area…</option>
                {data.areas.filter((area) => !area.archived && area.id !== pursuit.homeAreaId && !pursuit.participatingAreaIds.includes(area.id)).map((area) => <option key={area.id} value={area.id}>{areaPath(data, area.id)}</option>)}
              </select>
            </label>
          </div>
          {pursuit.participatingAreaIds.length ? <div className="flex flex-wrap gap-1.5">{pursuit.participatingAreaIds.map((id) => <button key={id} type="button" title={`Remove ${areaPath(data, id)} from participating Areas`} onClick={() => update(pursuit, { participatingAreaIds: pursuit.participatingAreaIds.filter((entry) => entry !== id) })} className="rounded-full border bg-background px-2 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{areaPath(data, id)} ×</button>)}</div> : null}
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            {pursuit.status !== "active" ? <Button variant="outline" size="sm" onClick={() => update(pursuit, { status: "active" })}><Play className="size-3.5" />Resume</Button> : <Button variant="outline" size="sm" onClick={() => update(pursuit, { status: "on_hold" })}><Pause className="size-3.5" />Hold</Button>}
            {pursuit.status !== "completed" && pursuit.status !== "archived" ? <Button variant="outline" size="sm" onClick={() => update(pursuit, { status: "completed" })} title={open ? "Finish or move open tasks first" : undefined}><CircleCheck className="size-3.5" />Complete</Button> : null}
            {pursuit.status !== "archived" ? <Button variant="ghost" size="sm" onClick={() => update(pursuit, { status: "archived" })}><Archive className="size-3.5" />Archive</Button> : <Button variant="outline" size="sm" onClick={() => update(pursuit, { status: "active" })}><RotateCcw className="size-3.5" />Restore</Button>}
          </div>
          {home?.archived ? <p className="text-xs text-muted-foreground">The home Area is archived. Restore it in Areas to assign new work here.</p> : null}
        </CardContent>
      </Card>;
    })}</div> : <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No Pursuits here yet. Name an effort and choose its home Area above.</div>}
  </div>;
}

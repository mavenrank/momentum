import { ArrowRight, FolderTree, Layers3, Waypoints } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlannerData } from "@/types/planner";
import type { SettingsSection } from "./SettingsSidebar";

export function OrganizationGuide({ data, onOpen }: { data: PlannerData; onOpen: (section: SettingsSection) => void }) {
  return <div className="space-y-4">
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">The organization model</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">From life context to a specific effort</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Use only as much structure as a task needs. You can capture first and classify later.</p>
      </div>
      <div className="grid gap-px bg-border md:grid-cols-3">
        {[
          { name: "Domain", icon: Layers3, count: data.domains.filter((entry) => !entry.archived).length, desc: "A broad part of life, such as Work or Personal. Keep the list short.", example: "Work", section: "domains" as const },
          { name: "Area", icon: FolderTree, count: data.areas.filter((entry) => !entry.archived).length, desc: "An ongoing responsibility inside a Domain. It still matters after any one effort ends.", example: "Work / Client relationships", section: "areas" as const },
          { name: "Pursuit", icon: Waypoints, count: data.pursuits.filter((entry) => entry.status !== "archived").length, desc: "A specific effort or outcome across tasks and dates. It has a home Area and can involve others.", example: "Renew Acme contract", section: "pursuits" as const },
        ].map(({ name, icon: Icon, count, desc, example, section }) => <button key={name} type="button" onClick={() => onOpen(section)} className="group flex flex-col bg-card p-5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <div className="flex w-full items-center justify-between"><Icon className="size-4 text-primary" /><span className="font-mono text-xs text-muted-foreground">{count} active</span></div>
          <h4 className="mt-4 text-base font-semibold">{name}</h4><p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
          <div className="mt-4 flex w-full items-center justify-between border-t pt-3 text-xs"><span className="truncate text-muted-foreground">{example}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
        </button>)}
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>How to place a task</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p><strong className="text-foreground">Capture quickly.</strong> A task can have no Domain, Area, or Pursuit. Assign one later when its place is clear.</p>
        <p><strong className="text-foreground">Choose the primary Area.</strong> This is where the task lives. Its Domain follows from that Area. If you only know the broad context, choose a Domain without an Area.</p>
        <p><strong className="text-foreground">Add a Pursuit when useful.</strong> Use it to retrieve a particular effort months later. A Pursuit needs a home Area; a task in the Pursuit uses its home or a participating Area.</p>
        <p><strong className="text-foreground">Mark other connections.</strong> Related Areas let one task appear in other contexts without giving it several primary homes.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Example: one task, several contexts</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>“Review Acme renewal proposal” may live in <strong className="text-foreground">Work / Client relationships</strong> and belong to the <strong className="text-foreground">Renew Acme contract</strong> Pursuit.</p>
        <p>If Legal is another Area, add it as a related Area. If the whole Pursuit includes tasks whose primary home is Legal, add Legal as a participating Area of that Pursuit.</p>
        <p>Names are scoped by context: two Areas in different Domains, or two Pursuits with different home Areas, may share a name. Stable IDs keep old tasks attached when you rename something.</p>
        <div className="flex flex-wrap gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => onOpen("areas")}>Manage Areas</Button><Button variant="outline" size="sm" onClick={() => onOpen("pursuits")}>Manage Pursuits</Button></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>What happens over time</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>Archive a Domain or Area when it is no longer in use. Its tasks and history remain available; restore it to use it for new work.</p>
        <p>A Pursuit can be active, on hold, completed, or archived. Completing it requires finishing or moving its open tasks. Archiving keeps its history.</p>
        <p>Merge Areas when two responsibilities have become one. Tasks and Pursuit memberships move to the destination Area; the source Area is archived.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>When to add structure</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>Make a Domain only for a broad part of life. Make an Area for a responsibility you expect to revisit. Make a Pursuit for an effort whose tasks you want to collect across time.</p>
        <p>If an effort touches several Areas, give it one home and add participating Areas. If a task merely touches another Area, use a related Area. A task does not need a Pursuit just because it has an Area.</p>
        <p>The Pursuits workspace retrieves tasks by these stable relationships, even after a label changes.</p>
      </CardContent></Card>
    </div>
    <p className="rounded-lg border bg-muted/25 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
      <strong className="text-foreground">Habits and Journal are paused.</strong> Their data remains in storage and exports, but their screens are hidden. Both need more focused, polished workflows before they belong in the planner again.
    </p>
  </div>;
}

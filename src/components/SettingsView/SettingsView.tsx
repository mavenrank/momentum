import * as React from "react";
import { ArchiveRestore, Check, Moon, Plus, Sun, Trash2, X } from "lucide-react";

import { DataView } from "@/components/DataView/DataView";
import { useTheme } from "@/components/ThemeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { COLOR_PRESETS, ColorPicker, ColorPopover } from "@/components/ui/color-picker";
import { useToast } from "@/components/ui/toast";
import { getAreaColor, nextCustomAreaColor } from "@/lib/areas";
import { areaPath, sortDomainsForDisplay } from "@/lib/organization";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import { allTasks } from "@/lib/plannerData";
import { setPreferences, usePreferences } from "@/lib/preferences";
import type { Area, PlannerData } from "@/types/planner";
import { OrganizationGuide } from "./OrganizationGuide";
import { PursuitSettings } from "./PursuitSettings";
import { SettingsSidebar } from "./SettingsSidebar";
import type { SettingsSection } from "./SettingsSidebar";

interface SettingsViewProps {
  data: PlannerData;
  execute: PlannerCommandExecutor;
  replaceData: (data: PlannerData) => void;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

const sectionCopy: Record<SettingsSection, { title: string; description: string }> = {
  guide: { title: "How it works", description: "A practical guide to Domains, Areas, Pursuits, and the tasks they hold." },
  domains: { title: "Domains", description: "The broad parts of life. Keep these few and recognizable." },
  areas: { title: "Areas", description: "Ongoing responsibilities within a Domain, with their own lifecycle." },
  pursuits: { title: "Pursuits", description: "Focused efforts that can involve several Areas and span many dates." },
  customization: { title: "Customization", description: "Choose how the planner looks and behaves on this device." },
  data: { title: "Data", description: "Storage, portable backups, exports, and a snapshot of your planner." },
};

export function SettingsView({ data, execute, replaceData, section, onSectionChange }: SettingsViewProps) {
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const preferences = usePreferences();
  const [draftName, setDraftName] = React.useState("");
  const [draftDomainId, setDraftDomainId] = React.useState("");
  const [newDomainName, setNewDomainName] = React.useState("");
  const [newDomainColor, setNewDomainColor] = React.useState<string>(COLOR_PRESETS[17].hex);
  const [draftColor, setDraftColor] = React.useState<string>(COLOR_PRESETS[0].hex);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [mergeSource, setMergeSource] = React.useState("");
  const [mergeTarget, setMergeTarget] = React.useState("");
  const [movingAreaId, setMovingAreaId] = React.useState<string | null>(null);

  const tasks = React.useMemo(() => allTasks(data), [data]);

  const usage = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.area) {
        const key = task.area;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const active = data.areas.filter((area) => !area.archived);
  const archived = data.areas.filter((area) => area.archived);
  const displayDomains = sortDomainsForDisplay(data.domains);
  const missingSeeds = data.domains.length === 0 || data.areas.length === 0;

  function addArea() {
    const name = draftName.trim();
    if (!name) {
      return;
    }
    const result = execute({ type: "area.create", name, domainId: draftDomainId || displayDomains.find((domain) => !domain.archived)?.id, color: draftColor });
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }

    setDraftName("");
    setDraftColor(nextCustomAreaColor(data.areas.length + 1));
    toast(`Area “${name}” added.`);
  }

  function patchArea(
    areaId: string,
    patch: Partial<Pick<Area, "name" | "color" | "archived">>,
  ) {
    const result = execute({ type: "area.update", areaId, patch });
    if (!result.ok) toast(result.error.message, "error");
  }

  function renameArea(area: Area, nextName: string) {
    const name = nextName.trim();
    setEditingId(null);

    if (!name || name === area.name) {
      return;
    }
    const result = execute({ type: "area.update", areaId: area.id, patch: { name } });
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }

    toast(`Renamed to “${name}”.`);
  }

  function restoreDefaults() {
    execute({ type: "area.restoreDefaults" });
    toast("Default areas restored.");
  }

  function mergeAreas() {
    const source = data.areas.find((area) => area.id === mergeSource);
    const target = data.areas.find((area) => area.id === mergeTarget);
    if (!source || !target || source.id === target.id) {
      return;
    }
    if (!window.confirm(`Move tasks from “${source.name}” to “${target.name}” and archive “${source.name}”?`)) {
      return;
    }
    const result = execute({ type: "area.merge", sourceId: source.id, targetId: target.id });
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }
    setMergeSource("");
    setMergeTarget("");
    toast(`Merged “${source.name}” into “${target.name}”.`);
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
      <SettingsSidebar section={section} onSectionChange={onSectionChange} />
      <div className="min-w-0 flex-1 pl-14 md:pl-0">
        <div key={section} className="view-enter h-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-4 pb-8">
            <header className="mb-5">
              <h2 className="text-2xl font-semibold tracking-tight">{sectionCopy[section].title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{sectionCopy[section].description}</p>
            </header>

      {section === "guide" ? <OrganizationGuide data={data} onOpen={onSectionChange} /> : null}
      {section === "customization" ? <>
      <Card>
        <CardHeader className="pb-2"><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-medium">Color theme</p><p className="mt-0.5 text-xs text-muted-foreground">The theme applies across Momentum on this device.</p></div>
          <Button variant="outline" size="sm" onClick={toggleTheme}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}{theme === "dark" ? "Use light theme" : "Use dark theme"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Planner</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={preferences.linkTimeBlocking}
              onChange={(event) => setPreferences({ linkTimeBlocking: event.target.checked })}
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="text-sm font-medium">
                Link time-blocking across Today and Week
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                On, the Time-Blocking button is a mode you are in: switching lens keeps it.
                Off, each lens remembers its own setting — useful if you plan the week as a
                list but run the day against the clock.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>
      </> : null}

      {section === "domains" ? <>
      <Card>
        <CardHeader className="pb-2"><CardTitle>Domains</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">A Domain is a broad part of your life, such as Work or Personal. An Area always belongs to one Domain. A task can be assigned directly to a Domain while you decide which Area it belongs to. Archiving a Domain keeps its Areas and task history.</p>
          <div className="space-y-1.5">{displayDomains.map((domain) => {
            const count = data.areas.filter((area) => area.domainId === domain.id).length;
            return <div key={domain.id} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 ${domain.archived ? "opacity-60" : ""}`} style={{ borderLeftColor: domain.color, borderLeftWidth: 3 }}>
              <input aria-label={`Rename ${domain.name}`} defaultValue={domain.name} key={`${domain.id}-${domain.name}`} className="min-w-28 flex-1 bg-transparent text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring" onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== domain.name) { const result = execute({ type: "domain.update", domainId: domain.id, patch: { name } }); if (!result.ok) toast(result.error.message, "error"); } }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              <span className="text-xs text-muted-foreground">{count} {count === 1 ? "Area" : "Areas"}</span>
              <ColorPopover label={domain.name} value={domain.color} onChange={(color) => { const result = execute({ type: "domain.update", domainId: domain.id, patch: { color } }); if (!result.ok) toast(result.error.message, "error"); }} />
              <Button variant="ghost" size="sm" onClick={() => { const result = execute({ type: "domain.update", domainId: domain.id, patch: { archived: !domain.archived } }); if (!result.ok) toast(result.error.message, "error"); }}>{domain.archived ? "Restore" : "Archive"}</Button>
            </div>;
          })}</div>
          <form className="space-y-4 border-t pt-4" onSubmit={(event) => { event.preventDefault(); if (!newDomainName.trim()) return; const result = execute({ type: "domain.create", name: newDomainName.trim(), color: newDomainColor }); if (!result.ok) toast(result.error.message, "error"); else setNewDomainName(""); }}>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={newDomainName} onChange={(event) => setNewDomainName(event.target.value)} placeholder="New Domain" aria-label="New Domain" className="max-w-56" />
              <Button type="submit" disabled={!newDomainName.trim()}><Plus className="size-4" /> Add Domain</Button>
            </div>
            <ColorPicker label="New Domain color" value={newDomainColor} onChange={setNewDomainColor} />
          </form>
        </CardContent>
      </Card>
      </> : null}

      {section === "areas" ? <>
      <p className="rounded-lg border bg-muted/25 px-4 py-3 text-sm leading-relaxed text-muted-foreground"><strong className="text-foreground">An Area is an ongoing responsibility within a Domain.</strong> A task may use only a Domain when its Area is undecided. “General” Areas were carried over from older data and remain distinct from choosing a Domain alone. Archive an Area to stop new assignments while keeping its history.</p>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>New area</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={draftDomainId || displayDomains.find((domain) => !domain.archived)?.id || ""} onChange={(event) => setDraftDomainId(event.target.value)} aria-label="Domain for new Area">
              {displayDomains.filter((domain) => !domain.archived).map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
            </select>
            <Input
              value={draftName}
              placeholder="Area name"
              className="max-w-56"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addArea();
                }
              }}
            />
            <Button onClick={addArea} disabled={!draftName.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>

          <ColorPicker label="New Area color" value={draftColor} onChange={setDraftColor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle>Areas</CardTitle>
          <div className="flex items-center gap-2">
            {missingSeeds ? (
              <Button variant="outline" size="sm" onClick={restoreDefaults}>
                Restore defaults
              </Button>
            ) : null}
            <Badge variant="muted">{active.length} active</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {displayDomains.map((domain) => {
            const domainAreas = active.filter((area) => area.domainId === domain.id);
            if (domainAreas.length === 0) return null;
            return <section key={domain.id} className="space-y-1.5" aria-label={`${domain.name} Areas`}>
              <div className="flex items-center gap-2 px-1 pb-1 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: domain.color }} aria-hidden />
                <span className="font-semibold text-foreground">{domain.name}</span>
                <span>Domain</span>
                <span className="ml-auto">{domainAreas.length} {domainAreas.length === 1 ? "Area" : "Areas"}</span>
              </div>
              {domainAreas.map((area) => {
            const count = usage.get(area.id) ?? 0;
            return (
              <div
                key={area.id}
                className="group flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5"
              >
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: getAreaColor(data.areas, area.id) }}
                />

                {editingId === area.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      className="h-7 max-w-56"
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          renameArea(area, editingName);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingId(null);
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Save"
                      onClick={() => renameArea(area, editingName)}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Cancel"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(area.id);
                        setEditingName(area.name);
                      }}
                      className="w-full min-w-0 truncate text-left text-sm hover:underline sm:w-auto sm:flex-1"
                      title="Rename"
                    >
                      {area.name}
                    </button>
                    {movingAreaId === area.id ? (
                      <select autoFocus value="" aria-label={`Move ${area.name} to Domain`} onChange={(event) => { const result = execute({ type: "area.update", areaId: area.id, patch: { domainId: event.target.value } }); if (!result.ok) toast(result.error.message, "error"); setMovingAreaId(null); }} onBlur={() => setMovingAreaId(null)} className="h-7 max-w-36 rounded border bg-background px-1 text-xs">
                        <option value="" disabled>Move to…</option>
                        {displayDomains.filter((target) => !target.archived && target.id !== area.domainId).map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                      </select>
                    ) : <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setMovingAreaId(area.id)}>Move</Button>}

                    {count > 0 ? (
                      <Badge variant="muted">
                        {count} task{count === 1 ? "" : "s"}
                      </Badge>
                    ) : null}

                    <ColorPopover label={area.name} value={area.color} onChange={(color) => patchArea(area.id, { color })} />

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={count > 0 ? `Archive (keeps ${count} tagged tasks)` : "Archive"}
                      className="shrink-0 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      onClick={() => patchArea(area.id, { archived: true })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}

              </div>
            );
              })}
            </section>;
          })}

          {active.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active areas. Add one above, or restore the defaults.
            </p>
          ) : null}

          {archived.length > 0 ? (
            <div className="pt-3">
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Archived
              </h4>
              {archived.map((area) => (
                <div
                  key={area.id}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1 opacity-60"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{areaPath(data, area.id)}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Restore"
                    onClick={() => patchArea(area.id, { archived: false })}
                  >
                    <ArchiveRestore className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle>Merge areas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Move all assigned tasks to another area and archive the old area. Task history stays intact.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={mergeSource} onChange={(event) => setMergeSource(event.target.value)} aria-label="Area to merge">
              <option value="">From area</option>
              {data.areas.map((area) => <option key={area.id} value={area.id}>{areaPath(data, area.id)}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">into</span>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)} aria-label="Destination area">
              <option value="">To area</option>
              {active.map((area) => <option key={area.id} value={area.id}>{areaPath(data, area.id)}</option>)}
            </select>
            <Button variant="outline" disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget} onClick={mergeAreas}>Merge</Button>
          </div>
        </CardContent>
      </Card>
      </> : null}

      {section === "pursuits" ? <PursuitSettings data={data} execute={execute} /> : null}
      {section === "data" ? <DataView data={data} replaceData={replaceData} embedded /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

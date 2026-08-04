import * as React from "react";
import type { Dispatch, SetStateAction } from "react";
import { ArchiveRestore, Check, Palette, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_AREA_SEEDS,
  findArea,
  getAreaColor,
  nextCustomAreaColor,
  seedAreas,
} from "@/lib/areas";
import { allTasks, createId } from "@/lib/plannerData";
import { setPreferences, usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import type { Area, PlannerData } from "@/types/planner";

/** Palette offered when creating or recolouring an area. */
const SWATCHES = [
  "#287c76",
  "#a45c40",
  "#4a7c9e",
  "#5b8c5a",
  "#8e6b8e",
  "#c49a3c",
  "#c06060",
  "#6b8f9e",
  "#7d8f6b",
  "#8f6b7d",
  "#9e7b6b",
  "#5f6b8f",
];

interface SettingsViewProps {
  data: PlannerData;
  setData: Dispatch<SetStateAction<PlannerData>>;
}

export function SettingsView({ data, setData }: SettingsViewProps) {
  const { toast } = useToast();
  const preferences = usePreferences();
  const [draftName, setDraftName] = React.useState("");
  const [draftColor, setDraftColor] = React.useState(SWATCHES[0]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  const tasks = React.useMemo(() => allTasks(data), [data]);

  const usage = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.area) {
        const key = task.area.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const active = data.areas.filter((area) => !area.archived);
  const archived = data.areas.filter((area) => area.archived);
  const missingSeeds = DEFAULT_AREA_SEEDS.filter((seed) => !findArea(data.areas, seed.name));

  function addArea() {
    const name = draftName.trim();
    if (!name) {
      return;
    }
    if (findArea(data.areas, name)) {
      toast(`“${name}” already exists.`, "error");
      return;
    }

    setData((current) => ({
      ...current,
      areas: [
        ...current.areas,
        {
          id: createId(),
          name,
          color: draftColor,
          createdAt: new Date().toISOString(),
          archived: false,
        },
      ],
    }));

    setDraftName("");
    setDraftColor(nextCustomAreaColor(data.areas.length + 1));
    toast(`Area “${name}” added.`);
  }

  function patchArea(areaId: string, patch: Partial<Area>) {
    setData((current) => ({
      ...current,
      areas: current.areas.map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
    }));
  }

  function renameArea(area: Area, nextName: string) {
    const name = nextName.trim();
    setEditingId(null);

    if (!name || name === area.name) {
      return;
    }
    if (findArea(data.areas, name)) {
      toast(`“${name}” already exists.`, "error");
      return;
    }

    // Tasks store the area by name, so a rename has to carry them along.
    setData((current) => ({
      ...current,
      areas: current.areas.map((entry) =>
        entry.id === area.id ? { ...entry, name } : entry,
      ),
      daily: Object.fromEntries(
        Object.entries(current.daily).map(([date, entry]) => [
          date,
          {
            ...entry,
            tasks: entry.tasks.map((task) =>
              task.area?.toLowerCase() === area.name.toLowerCase()
                ? { ...task, area: name }
                : task,
            ),
          },
        ]),
      ),
    }));

    toast(`Renamed to “${name}”.`);
  }

  function restoreDefaults() {
    setData((current) => ({
      ...current,
      areas: [
        ...current.areas,
        ...seedAreas(createId, new Date().toISOString()).filter(
          (seed) => !findArea(current.areas, seed.name),
        ),
      ],
    }));
    toast("Default areas restored.");
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Areas power the coloured dots and the <code className="font-mono">#tag</code>{" "}
          autocomplete in Quick Add.
        </p>
      </header>

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>New area</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
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

          <div className="flex flex-wrap items-center gap-1.5">
            <Palette className="size-3.5 text-muted-foreground" />
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => setDraftColor(color)}
                className={cn(
                  "size-5 rounded-full border-2 transition-transform",
                  draftColor === color
                    ? "scale-110 border-foreground"
                    : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle>Areas</CardTitle>
          <div className="flex items-center gap-2">
            {missingSeeds.length > 0 ? (
              <Button variant="outline" size="sm" onClick={restoreDefaults}>
                Restore defaults
              </Button>
            ) : null}
            <Badge variant="muted">{active.length} active</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {active.map((area) => {
            const count = usage.get(area.name.toLowerCase()) ?? 0;
            const isDefault = DEFAULT_AREA_SEEDS.some(
              (seed) => seed.name.toLowerCase() === area.name.toLowerCase(),
            );

            return (
              <div
                key={area.id}
                className="group flex items-center gap-2 rounded-md border px-2.5 py-1.5"
              >
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: getAreaColor(data.areas, area.name) }}
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
                      className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                      title="Rename"
                    >
                      {area.name}
                    </button>

                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      #{area.name.toLowerCase()}
                    </span>

                    {count > 0 ? (
                      <Badge variant="muted">
                        {count} task{count === 1 ? "" : "s"}
                      </Badge>
                    ) : null}

                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
                      {SWATCHES.slice(0, 7).map((color) => (
                        <button
                          key={color}
                          type="button"
                          title={`Recolour to ${color}`}
                          onClick={() => patchArea(area.id, { color })}
                          className="size-3.5 rounded-full border border-border/50"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={count > 0 ? `Archive (keeps ${count} tagged tasks)` : "Archive"}
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => patchArea(area.id, { archived: true })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}

                {isDefault && editingId !== area.id ? (
                  <span className="sr-only">Default area</span>
                ) : null}
              </div>
            );
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
                  <span className="min-w-0 flex-1 truncate text-sm">{area.name}</span>
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
    </div>
  );
}

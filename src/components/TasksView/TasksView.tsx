import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { areaPath } from "@/lib/organization";
import { allTasks } from "@/lib/plannerData";
import { PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES } from "@/types/planner";
import type { Area, DailyTask, Domain, PlannerData, Pursuit } from "@/types/planner";

interface Filters {
  query: string;
  status: string;
  domain: string;
  area: string;
  pursuit: string;
  date: string;
}

type SortField = "title" | "status" | "scheduled" | "domain" | "area" | "pursuit" | "priority" | "updated";
type SortDirection = "asc" | "desc";
interface SortState { field: SortField; direction: SortDirection }

const sortFields: SortField[] = ["title", "status", "scheduled", "domain", "area", "pursuit", "priority", "updated"];
const defaultSort: SortState = { field: "updated", direction: "desc" };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const ROW_HEIGHT = 56;
const OVERSCAN = 8;

function sortFromUrl(): SortState {
  const params = new URLSearchParams(window.location.search);
  const field = params.get("sort");
  return field && sortFields.includes(field as SortField)
    ? { field: field as SortField, direction: params.get("dir") === "desc" ? "desc" : "asc" }
    : defaultSort;
}

function sortValue(task: DailyTask, field: SortField, areas: Map<string, Area>, domains: Map<string, Domain>, pursuits: Map<string, Pursuit>): string | number | undefined {
  const area = task.area ? areas.get(task.area) : undefined;
  switch (field) {
    case "title": return task.title;
    case "status": return TASK_STATUSES.indexOf(task.status);
    case "scheduled": return task.scheduledDate ? `${task.scheduledDate}|${task.allDay ? "0" : task.timeOfDay ? "1" : "2"}|${task.timeOfDay ?? ""}` : undefined;
    case "domain": return domains.get(area?.domainId ?? task.domainId ?? "")?.name;
    case "area": return area?.name;
    case "pursuit": return pursuits.get(task.pursuitId ?? "")?.name;
    case "priority": return task.priority ? TASK_PRIORITIES.indexOf(task.priority) : undefined;
    case "updated": return task.updatedAt;
  }
}

function filtersFromUrl(): Filters {
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("q") ?? "",
    status: params.get("status") ?? "all",
    domain: params.get("domain") ?? "",
    area: params.get("area") ?? "",
    pursuit: params.get("pursuit") ?? "",
    date: params.get("date") ?? "",
  };
}

let savedScrollTop = 0;

export function TasksView({ data, onOpenTask }: { data: PlannerData; onOpenTask: (id: string) => void }) {
  const [filters, setFilters] = React.useState<Filters>(filtersFromUrl);
  const [sort, setSort] = React.useState<SortState>(sortFromUrl);
  const [scrollTop, setScrollTop] = React.useState(savedScrollTop);
  const [viewportHeight, setViewportHeight] = React.useState(640);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const tasks = React.useMemo(() => allTasks(data), [data]);
  const areasById = React.useMemo(() => new Map(data.areas.map((area) => [area.id, area])), [data.areas]);
  const domainsById = React.useMemo(() => new Map(data.domains.map((domain) => [domain.id, domain])), [data.domains]);
  const pursuitsById = React.useMemo(() => new Map(data.pursuits.map((pursuit) => [pursuit.id, pursuit])), [data.pursuits]);

  React.useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop;
  }, []);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    setViewportHeight(node.clientHeight);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.domain) params.set("domain", filters.domain);
    if (filters.area) params.set("area", filters.area);
    if (filters.pursuit) params.set("pursuit", filters.pursuit);
    if (filters.date) params.set("date", filters.date);
    if (sort.field !== defaultSort.field || sort.direction !== defaultSort.direction) {
      params.set("sort", sort.field);
      params.set("dir", sort.direction);
    }
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `/tasks${query ? `?${query}` : ""}`);
  }, [filters, sort]);

  const visible = React.useMemo(() => {
    const term = filters.query.trim().toLocaleLowerCase();
    const filtered = tasks.filter((task) => {
      if (filters.status !== "open" && filters.status !== "all" && task.status !== filters.status) return false;
      if (filters.status === "open" && task.status === "done") return false;
      const primaryArea = task.area ? areasById.get(task.area) : undefined;
      const relatedAreas = (task.relatedAreaIds ?? []).map((id) => areasById.get(id)).filter((area) => area != null);
      if (filters.domain && (primaryArea?.domainId ?? task.domainId) !== filters.domain && !relatedAreas.some((area) => area.domainId === filters.domain)) return false;
      if (filters.area && task.area !== filters.area && !task.relatedAreaIds?.includes(filters.area)) return false;
      if (filters.pursuit && task.pursuitId !== filters.pursuit) return false;
      if (filters.date && task.scheduledDate !== filters.date) return false;
      if (term && ![task.id, task.title, task.summary, task.description].some((value) => value?.toLocaleLowerCase().includes(term))) return false;
      return true;
    });
    // Resolve labels once per task, rather than looking them up for every sort comparison.
    return filtered.map((task) => ({ task, value: sortValue(task, sort.field, areasById, domainsById, pursuitsById) })).sort((a, b) => {
      const first = a.value;
      const second = b.value;
      if (first == null && second != null) return 1;
      if (second == null && first != null) return -1;
      const comparison = first == null || second == null ? 0 : typeof first === "number" && typeof second === "number"
        ? first - second : collator.compare(String(first), String(second));
      return (sort.direction === "asc" ? comparison : -comparison) || collator.compare(a.task.id, b.task.id);
    }).map(({ task }) => task);
  }, [tasks, areasById, domainsById, pursuitsById, filters, sort]);

  const firstRow = Math.min(Math.max(0, visible.length - 1), Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
  const lastRow = Math.min(visible.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);

  function resetScroll() {
    savedScrollTop = 0;
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    resetScroll();
    setFilters((current) => ({ ...current, [key]: value, ...(key === "domain" ? { area: "", pursuit: "" } : {}), ...(key === "area" ? { pursuit: "" } : {}) }));
  }

  const areas = data.areas.filter((area) => !filters.domain || area.domainId === filters.domain);
  const pursuits = data.pursuits.filter((pursuit) => {
    const areaIds = [pursuit.homeAreaId, ...pursuit.participatingAreaIds];
    if (filters.area) return areaIds.includes(filters.area);
    if (filters.domain) return areaIds.some((id) => data.areas.find((area) => area.id === id)?.domainId === filters.domain);
    return true;
  });
  const hasFilters = Boolean(filters.query || filters.domain || filters.area || filters.pursuit || filters.date || filters.status !== "all");

  function changeSort(field: SortField) {
    setSort((current) => current.field === field
      ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
      : { field, direction: field === "updated" ? "desc" : "asc" });
    resetScroll();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-3 pb-4 pt-5 sm:px-6 sm:pt-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-medium text-muted-foreground">Across every date</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">All tasks</h1></div>
          <p className="pb-1 font-mono text-xs text-muted-foreground">{visible.length} of {tasks.length} tasks</p>
        </div>
      </div>

      <div className="shrink-0 border-b px-3 py-3 sm:px-6">
        <div className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_10rem_11rem_auto] md:items-end">
          <label className="relative block"><span className="sr-only">Search tasks</span><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Search title, notes, or task ID" className="pl-9" /></label>
          <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)} options={[["all", "All statuses"], ["open", "Open"], ...TASK_STATUSES.map((status): [string, string] => [status, STATUS_LABELS[status]])]} />
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground"><span className="shrink-0">Date</span><input type="date" aria-label="Scheduled date" value={filters.date} onChange={(event) => setFilter("date", event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" /></label>
          <Button variant="ghost" size="sm" disabled={!hasFilters} onClick={() => { setFilters({ query: "", status: "all", domain: "", area: "", pursuit: "", date: "" }); resetScroll(); }} className="justify-start"><X className="size-3.5" />Clear filters</Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-[6.5rem_repeat(3,minmax(0,1fr))] lg:items-end">
          <p className="hidden pb-2 text-xs font-medium text-muted-foreground lg:block">Filed under</p>
          <FilterSelect label="Domain" value={filters.domain} onChange={(value) => setFilter("domain", value)} options={[["", "Any Domain"], ...data.domains.map((domain): [string, string] => [domain.id, domain.name])]} />
          <FilterSelect label="Area" value={filters.area} onChange={(value) => setFilter("area", value)} options={[["", "Any Area"], ...areas.map((area): [string, string] => [area.id, filters.domain ? area.name : areaPath(data, area.id) ?? area.name])]} />
          <FilterSelect label="Pursuit" value={filters.pursuit} onChange={(value) => setFilter("pursuit", value)} options={[["", "Any Pursuit"], ...pursuits.map((pursuit): [string, string] => [pursuit.id, filters.area ? pursuit.name : `${pursuit.name} · ${areaPath(data, pursuit.homeAreaId) ?? "Unknown Area"}`])]} />
        </div>
      </div>

      <div ref={scrollRef} onScroll={(event) => { savedScrollTop = event.currentTarget.scrollTop; setScrollTop(savedScrollTop); }} className="min-h-0 flex-1 overflow-auto" aria-label="All tasks table">
        <table className="w-full min-w-[1180px] table-fixed border-collapse text-left">
          <colgroup><col className="w-[28%]" /><col className="w-[9%]" /><col className="w-[12%]" /><col className="w-[33%]" /><col className="w-[9%]" /><col className="w-[9%]" /></colgroup>
          <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
            <tr className="h-14 text-xs text-muted-foreground">
              <th scope="col" className="sticky left-0 z-20 bg-card px-4 font-medium"><SortButton label="Task" field="title" sort={sort} onSort={changeSort} /></th>
              <th scope="col" className="px-3 font-medium"><SortButton label="Status" field="status" sort={sort} onSort={changeSort} /></th>
              <th scope="col" className="px-3 font-medium"><SortButton label="Scheduled" field="scheduled" sort={sort} onSort={changeSort} /></th>
              <th scope="col" className="border-x px-3 font-medium"><span className="block pb-1 text-[10px] uppercase tracking-wider">Organization</span><span className="grid grid-cols-3 gap-2"><SortButton label="Domain" field="domain" sort={sort} onSort={changeSort} /><SortButton label="Area" field="area" sort={sort} onSort={changeSort} /><SortButton label="Pursuit" field="pursuit" sort={sort} onSort={changeSort} /></span></th>
              <th scope="col" className="px-3 font-medium"><SortButton label="Priority" field="priority" sort={sort} onSort={changeSort} /></th>
              <th scope="col" className="px-3 font-medium"><SortButton label="Updated" field="updated" sort={sort} onSort={changeSort} /></th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? <>
              {firstRow > 0 ? <tr aria-hidden="true"><td colSpan={6} style={{ height: firstRow * ROW_HEIGHT, padding: 0, border: 0 }} /></tr> : null}
              {visible.slice(firstRow, lastRow).map((task) => <TaskRow key={task.id} task={task} data={data} areasById={areasById} domainsById={domainsById} pursuitsById={pursuitsById} onOpen={() => onOpenTask(task.id)} />)}
              {lastRow < visible.length ? <tr aria-hidden="true"><td colSpan={6} style={{ height: (visible.length - lastRow) * ROW_HEIGHT, padding: 0, border: 0 }} /></tr> : null}
            </> : <tr><td colSpan={6} className="px-4 py-16 text-center"><p className="font-medium">No tasks match these filters</p><p className="mt-1 text-sm text-muted-foreground">Change a filter or clear them to see more tasks.</p></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="min-w-0"><span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

function SortButton({ label, field, sort, onSort }: { label: string; field: SortField; sort: SortState; onSort: (field: SortField) => void }) {
  const active = sort.field === field;
  const Icon = active ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <button type="button" onClick={() => onSort(field)} aria-pressed={active} aria-label={`Sort by ${label}${active ? `, ${sort.direction === "asc" ? "ascending" : "descending"}` : ""}`} className={`inline-flex max-w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "text-foreground" : "text-muted-foreground"}`}><span className="truncate">{label}</span><Icon className={`size-3 shrink-0 ${active ? "text-primary" : "opacity-50"}`} /></button>;
}

function TaskRow({ task, data, areasById, domainsById, pursuitsById, onOpen }: { task: DailyTask; data: PlannerData; areasById: Map<string, Area>; domainsById: Map<string, Domain>; pursuitsById: Map<string, Pursuit>; onOpen: () => void }) {
  const area = areasById.get(task.area ?? "");
  const domain = domainsById.get(area?.domainId ?? task.domainId ?? "");
  const pursuit = pursuitsById.get(task.pursuitId ?? "");
  const relatedAreas = (task.relatedAreaIds ?? []).map((id) => areasById.get(id)).filter((entry) => entry != null);
  const relatedDomains = data.domains.filter((entry) => entry.id !== domain?.id && relatedAreas.some((relatedArea) => relatedArea.domainId === entry.id));
  const domainTitle = [domain?.name ?? "Unassigned", ...relatedDomains.map((entry) => `${entry.name} (related)`)].join(" · ");
  const areaTitle = [area?.name ?? "No primary Area", ...relatedAreas.map((entry) => `${entry.name} (related)`)].join(" · ");
  return <tr className="group h-14 cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/30" onClick={onOpen}>
      <td className="sticky left-0 z-10 bg-background px-4 py-2 group-hover:bg-accent/30"><button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="flex w-full min-w-0 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: area?.color ?? domain?.color ?? "var(--muted-foreground)" }} /><span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">{task.id}{task.summary ? ` · ${task.summary}` : ""}</span></span><ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" /></button></td>
      <td className="px-3 py-2 text-xs"><span className="rounded border border-border px-2 py-1">{STATUS_LABELS[task.status]}</span></td>
      <td className="px-3 py-2 text-xs"><span className="block font-mono">{task.scheduledDate ?? "—"}</span>{task.allDay ? <span className="text-muted-foreground">All day</span> : task.timeOfDay ? <span className="text-muted-foreground">{task.timeOfDay}</span> : null}</td>
      <td className="border-x px-3 py-2">
        <div className="grid grid-cols-3 items-center gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5" title={domainTitle}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: domain?.color ?? "var(--muted-foreground)" }} />
            <span className="truncate">{domain?.name ?? "Unassigned"}</span>
            {relatedDomains.length > 0 ? <span className="shrink-0 text-[10px] text-muted-foreground">+{relatedDomains.length}</span> : null}
          </span>
          <span className="flex min-w-0 items-center gap-1.5" title={areaTitle}>
            {area ? <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: area.color }} /> : null}
            <span className={`truncate ${area ? "" : "text-muted-foreground"}`}>{area?.name ?? "—"}</span>
            {relatedAreas.length > 0 ? <span className="shrink-0 text-[10px] text-muted-foreground">+{relatedAreas.length}</span> : null}
          </span>
          <span className={`truncate ${pursuit ? "font-medium" : "text-muted-foreground"}`} title={pursuit?.name ?? "No Pursuit"}>{pursuit?.name ?? "—"}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs">{task.priority ? PRIORITY_LABELS[task.priority] : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{task.updatedAt.slice(0, 10)}</td>
    </tr>
}

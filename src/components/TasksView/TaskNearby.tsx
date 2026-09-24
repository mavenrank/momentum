import { ArrowUpRight, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/types/planner";
import type { DailyTask, PlannerData } from "@/types/planner";

export function TaskNearby({ task, tasks, data, onOpenTask, onOpenTasks }: { task: DailyTask; tasks: DailyTask[]; data: PlannerData; onOpenTask: (id: string) => void; onOpenTasks: () => void }) {
  const pursuit = data.pursuits.find((entry) => entry.id === task.pursuitId);
  const area = data.areas.find((entry) => entry.id === task.area);
  const candidates = task.pursuitId
    ? tasks.filter((entry) => entry.pursuitId === task.pursuitId && entry.id !== task.id)
    : task.area
      ? tasks.filter((entry) => entry.area === task.area && entry.id !== task.id)
      : tasks.filter((entry) => entry.id !== task.id);
  const nearby = candidates.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 7);
  const label = pursuit ? `In ${pursuit.name}` : area ? `In ${area.name}` : "Recently updated";

  return <section className="rounded-xl border bg-card/30 p-4 sm:p-5" aria-label="Other tasks">
    <div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">Other tasks</h2><p className="mt-1 text-xs text-muted-foreground">{label}</p></div><ListFilter className="size-4 text-muted-foreground" /></div>
    <div className="mt-3 grid gap-x-4 sm:grid-cols-2">{nearby.length ? nearby.map((entry) => <button key={entry.id} type="button" onClick={() => onOpenTask(entry.id)} className="group flex min-w-0 items-start justify-between gap-2 border-t py-2.5 text-left"><span className="min-w-0"><span className={`block line-clamp-2 text-xs font-medium group-hover:underline ${entry.status === "done" ? "text-muted-foreground line-through" : ""}`}>{entry.title}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{entry.scheduledDate ?? STATUS_LABELS[entry.status]}</span></span><ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" /></button>) : <p className="py-3 text-xs text-muted-foreground">No other tasks here yet.</p>}</div>
    <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={onOpenTasks}>Browse all tasks <ArrowUpRight className="size-3.5" /></Button>
  </section>;
}

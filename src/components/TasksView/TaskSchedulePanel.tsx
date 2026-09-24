import * as React from "react";
import { CalendarDays, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { addDays, formatFriendlyDate, toDateKey } from "@/lib/date";
import type { PlannerCommandExecutor } from "@/lib/application/commands";
import type { DailyTask } from "@/types/planner";

export function TaskSchedulePanel({ task, execute, onOpenDay }: { task: DailyTask; execute: PlannerCommandExecutor; onOpenDay: (date: string) => void }) {
  const { toast } = useToast();
  const [date, setDate] = React.useState(task.scheduledDate ?? "");
  const [time, setTime] = React.useState(task.timeOfDay ?? "");
  const [allDay, setAllDay] = React.useState(Boolean(task.allDay));
  const today = toDateKey(new Date());
  const changed = date !== (task.scheduledDate ?? "") || time !== (task.timeOfDay ?? "") || allDay !== Boolean(task.allDay);
  const saveLabel = !date && task.scheduledDate ? "Remove date" : task.scheduledDate ? "Reschedule" : "Schedule task";

  React.useEffect(() => {
    setDate(task.scheduledDate ?? "");
    setTime(task.timeOfDay ?? "");
    setAllDay(Boolean(task.allDay));
  }, [task.scheduledDate, task.timeOfDay, task.allDay]);

  function save() {
    const status = !date
      ? (task.status === "done" ? "done" : "planned")
      : task.status === "done" || task.status === "doing" || task.status === "waiting" ? task.status : "scheduled";
    const result = execute({ type: "task.update", taskId: task.id, patch: {
      scheduledDate: date || undefined,
      timeOfDay: date && !allDay ? time.trim() || undefined : undefined,
      allDay: date && allDay ? true : undefined,
      status,
    }, conflictPolicy: "warn" });
    if (!result.ok) { toast(result.error.message, "error"); return; }
    if (result.warnings.length) toast(result.warnings[0].message);
    else toast(date ? "Schedule updated." : "Date removed.");
  }

  function returnToPool() {
    const result = execute({ type: "task.returnToPool", taskId: task.id });
    if (!result.ok) toast(result.error.message, "error");
    else toast("Task moved to the Pool.");
  }

  return <section className="rounded-xl border bg-card/50 p-4" aria-label="Schedule task">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Schedule</h2><CalendarDays className="size-4 text-muted-foreground" /></div>
    {task.scheduledDate ? <button type="button" onClick={() => onOpenDay(task.scheduledDate!)} className="mt-1 text-left text-xs text-muted-foreground underline-offset-4 hover:underline">View {formatFriendlyDate(task.scheduledDate)} in Planner</button> : <p className="mt-1 text-xs text-muted-foreground">Choose when this task belongs on your calendar.</p>}

    <div className="mt-4 grid grid-cols-3 gap-1.5">
      {[["Today", today], ["Tomorrow", addDays(today, 1)], ["Next week", addDays(today, 7)]].map(([label, value]) => <Button key={label} type="button" size="sm" variant={date === value ? "default" : "outline"} onClick={() => setDate(value)} className="px-1 text-xs">{label}</Button>)}
    </div>
    <label className="mt-3 block text-xs font-medium text-muted-foreground">Date<Input type="date" aria-label="Task date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1" /></label>
    <div className="mt-3 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground"><span>Time</span><label className="flex items-center gap-1.5"><input type="checkbox" checked={allDay} disabled={!date} onChange={(event) => { setAllDay(event.target.checked); if (event.target.checked) setTime(""); }} />All day</label></div>
    <div className="relative mt-1"><Clock3 className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={time} aria-label="Task time" placeholder="09:00 or 09:00-10:00" disabled={!date || allDay} onChange={(event) => setTime(event.target.value)} className="pl-9" /></div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><Button size="sm" disabled={!changed} onClick={save}>{saveLabel}</Button>{task.status !== "pool" ? <Button size="sm" variant="ghost" onClick={returnToPool}>Move to Pool</Button> : null}</div>
  </section>;
}

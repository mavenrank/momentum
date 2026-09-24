import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { CalendarRange, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { QuickAdd } from "./QuickAdd";
import { VirtualTaskList, type VirtualTaskItem } from "./VirtualTaskList";
import { cn } from "@/lib/utils";
import type { ParsedTask } from "@/lib/nlp/taskParser";
import type { Area, DailyTask, Domain } from "@/types/planner";

export type InboxBucket = "pool" | "unscheduled";

const BUCKETS = [
  {
    id: "pool",
    label: "Pool",
    icon: Inbox,
    placeholder: "Dump an untriaged task…",
    empty: "Nothing untriaged.",
  },
  {
    id: "unscheduled",
    label: "This week",
    icon: CalendarRange,
    placeholder: "Commit a task to this week…",
    empty: "Nothing committed to this week yet.",
  },
] as const satisfies ReadonlyArray<{
  id: InboxBucket;
  label: string;
  icon: typeof Inbox;
  placeholder: string;
  empty: string;
}>;

interface InboxPanelProps {
  pool: DailyTask[];
  unscheduled: DailyTask[];
  areas: Area[];
  domains: Domain[];
  active: InboxBucket;
  onActiveChange: (bucket: InboxBucket) => void;
  onCreate: (bucket: InboxBucket, tasks: ParsedTask[]) => boolean | void;
  renderTask: (task: DailyTask) => React.ReactNode;
  className?: string;
}

/**
 * Pool and "unscheduled this week" in one panel.
 *
 * They are genuinely different — Pool is untriaged, unscheduled means committed
 * to the week without a day — but as two side-by-side boxes they spent a third
 * of the screen to say "nothing here" twice. One panel with a filter keeps the
 * distinction, costs one row, and hands the rest back to the day strip.
 *
 * Both remain separate drop targets: the inactive tab is still droppable, and
 * dragging onto it switches to it, so a task can be filed either way without
 * clicking first.
 */
export function InboxPanel({
  pool,
  unscheduled,
  areas,
  domains,
  active,
  onActiveChange,
  onCreate,
  renderTask,
  className,
}: InboxPanelProps) {
  const tasks = active === "pool" ? pool : unscheduled;
  const items = React.useMemo<VirtualTaskItem[]>(() => tasks.map((task) => ({ key: task.id, task })), [tasks]);
  const counts: Record<InboxBucket, number> = {
    pool: pool.length,
    unscheduled: unscheduled.length,
  };
  const bucket = BUCKETS.find((entry) => entry.id === active) ?? BUCKETS[0];

  return (
    <section className={cn("flex min-h-0 flex-col rounded-lg border bg-card", className)}>
      <header className="flex shrink-0 items-center gap-1 border-b p-1">
        {BUCKETS.map((entry) => (
          <BucketTab
            key={entry.id}
            id={entry.id}
            label={entry.label}
            icon={entry.icon}
            count={counts[entry.id]}
            active={active === entry.id}
            onSelect={() => onActiveChange(entry.id)}
          />
        ))}
      </header>

      <div className="flex min-h-0 flex-col gap-2 p-2">
        <QuickAdd
          areas={areas}
          domains={domains}
          placeholder={bucket.placeholder}
          showPreview={false}
          onCreate={(parsed) => onCreate(active, parsed)}
        />

        <VirtualTaskList key={active} items={items} renderTask={renderTask} empty={bucket.empty} estimatedTaskHeight={60} className="max-h-36 min-h-0" />
      </div>
    </section>
  );
}

function BucketTab({
  id,
  label,
  icon: Icon,
  count,
  active,
  onSelect,
}: {
  id: InboxBucket;
  label: string;
  icon: typeof Inbox;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Dragging onto a tab reveals it, so the drop and the view agree by the time
  // the pointer is released.
  React.useEffect(() => {
    if (isOver && !active) {
      onSelect();
    }
  }, [isOver, active, onSelect]);

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        isOver && "ring-2 ring-ring",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
      <Badge variant="muted">{count}</Badge>
    </button>
  );
}

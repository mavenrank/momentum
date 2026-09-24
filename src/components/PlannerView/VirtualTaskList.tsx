import * as React from "react";

import { cn } from "@/lib/utils";
import type { DailyTask } from "@/types/planner";

export type VirtualTaskItem = { key: string; task: DailyTask } | { key: string; label: string };

const GAP = 6;
const OVERSCAN_PX = 320;

function indexAt(offsets: number[], position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (offsets[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return Math.min(low, offsets.length - 2);
}

/** Keeps large inboxes responsive while preserving each card's natural height. */
export function VirtualTaskList({ items, renderTask, empty, estimatedTaskHeight = 80, className }: {
  items: VirtualTaskItem[];
  renderTask: (task: DailyTask) => React.ReactNode;
  empty: string;
  estimatedTaskHeight?: number;
  className?: string;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(400);
  const [heights, setHeights] = React.useState<Map<string, number>>(() => new Map());

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    setViewportHeight(node.clientHeight);
    return () => observer.disconnect();
  }, []);

  const measure = React.useCallback((key: string, height: number) => {
    setHeights((current) => {
      if (Math.abs((current.get(key) ?? 0) - height) < 1) return current;
      const next = new Map(current);
      next.set(key, height);
      return next;
    });
  }, []);

  const offsets = React.useMemo(() => {
    const result = [0];
    for (const item of items) {
      result.push(result[result.length - 1] + (heights.get(item.key) ?? ("task" in item ? estimatedTaskHeight : 28)));
    }
    return result;
  }, [items, heights, estimatedTaskHeight]);

  const start = items.length ? Math.max(0, indexAt(offsets, Math.max(0, scrollTop - OVERSCAN_PX))) : 0;
  const end = items.length ? Math.min(items.length, indexAt(offsets, scrollTop + viewportHeight + OVERSCAN_PX) + 1) : 0;

  return (
    <div ref={scrollRef} role="list" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} className={cn("overflow-y-auto", className)}>
      {items.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">{empty}</p> : (
        <div className="relative" style={{ height: offsets[items.length] }}>
          {items.slice(start, end).map((item, relativeIndex) => (
            <MeasuredItem key={item.key} itemKey={item.key} top={offsets[start + relativeIndex]} onMeasure={measure}>
              {"task" in item ? renderTask(item.task) : <p className="px-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>}
            </MeasuredItem>
          ))}
        </div>
      )}
    </div>
  );
}

function MeasuredItem({ itemKey, top, onMeasure, children }: {
  itemKey: string;
  top: number;
  onMeasure: (key: string, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => onMeasure(itemKey, node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, [itemKey, onMeasure]);

  return <div ref={ref} className="absolute inset-x-0" style={{ top, paddingBottom: GAP }}>{children}</div>;
}

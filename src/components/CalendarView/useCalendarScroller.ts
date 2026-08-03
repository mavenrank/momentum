import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, fromDateKey, startOfMonthKey, startOfWeekKey, toDateKey } from "@/lib/date";

/** Weeks held on each side of the anchor before the range grows. */
const INITIAL_WEEKS = 60;
const EXTEND_BY = 40;
/** Extend once the reading line comes within this many weeks of an edge. */
const EXTEND_THRESHOLD = 12;
/** Week rows rendered beyond the viewport on each side. */
const OVERSCAN = 6;
/** Idle time after the last scroll event before the snap fires. */
const SNAP_DELAY_MS = 150;
/**
 * Snap to a month boundary when one is within this many rows. Months run 4–6
 * rows, so this reaches a boundary from most resting positions — which is what
 * makes the scroll feel like it clicks into months.
 */
const SNAP_WITHIN_ROWS = 3;

export interface CalendarScroller {
  weeks: string[];
  /** Index range currently mounted, plus the spacer heights around it. */
  firstVisible: number;
  lastVisible: number;
  topSpacer: number;
  bottomSpacer: number;
  activeMonth: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  jumpToMonth: (monthKey: string) => void;
  stepMonth: (delta: number) => void;
}

function buildWeeks(anchorWeek: string, before: number, after: number): string[] {
  const start = addDays(anchorWeek, -before * 7);
  return Array.from({ length: before + after + 1 }, (_, index) => addDays(start, index * 7));
}

/**
 * The month the viewport is actually showing — the one owning the most visible
 * days. A single week straddles two months, so picking by one day (its Thursday,
 * say) makes the heading disagree with what fills the screen.
 */
function dominantMonth(weeks: string[], firstRow: number, lastRow: number): string | null {
  const tally = new Map<string, number>();
  const start = Math.max(0, firstRow);
  const end = Math.min(lastRow, weeks.length - 1);
  const span = end - start + 1;

  for (let row = start; row <= end; row += 1) {
    const weekStart = weeks[row];
    if (!weekStart) {
      continue;
    }

    // Rows nearer the top count for more, so the heading turns over as the new
    // month takes the upper part of the screen rather than lagging behind.
    const weight = span - (row - start);

    for (let offset = 0; offset < 7; offset += 1) {
      const month = startOfMonthKey(addDays(weekStart, offset));
      tally.set(month, (tally.get(month) ?? 0) + weight);
    }
  }

  let best: string | null = null;
  let bestCount = -1;
  for (const [month, count] of tally) {
    // Ties resolve to the later month, so scrolling forward advances promptly.
    if (count > bestCount || (count === bestCount && best !== null && month > best)) {
      best = month;
      bestCount = count;
    }
  }

  return best;
}

/** True when this week row contains the 1st of a month — a month's first row. */
function isMonthBoundary(weekStart: string): boolean {
  for (let offset = 0; offset < 7; offset += 1) {
    if (fromDateKey(addDays(weekStart, offset)).getDate() === 1) {
      return true;
    }
  }
  return false;
}

/** The month-boundary row closest to `raw`, if one sits within `radius` rows. */
function nearestMonthBoundary(
  weeks: string[],
  raw: number,
  radius: number,
): number | null {
  const centre = Math.round(raw);
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  const from = Math.max(0, centre - radius - 1);
  const to = Math.min(weeks.length - 1, centre + radius + 1);

  for (let row = from; row <= to; row += 1) {
    if (!isMonthBoundary(weeks[row])) {
      continue;
    }
    const distance = Math.abs(row - raw);
    if (distance <= radius && distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }

  return best;
}

export function useCalendarScroller(
  initialDate: string,
  rowHeight: number,
): CalendarScroller {
  // Open on the first row of the selected date's month, so the view starts with
  // a whole month rather than a mid-month slice.
  const anchorWeek = startOfWeekKey(startOfMonthKey(initialDate));

  const [weeks, setWeeks] = useState(() =>
    buildWeeks(anchorWeek, INITIAL_WEEKS, INITIAL_WEEKS),
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [activeMonth, setActiveMonth] = useState(() => startOfMonthKey(initialDate));

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const snapTimer = useRef<number | null>(null);
  // Row index at the top of the viewport, kept so a row-height change can be
  // re-applied without the view sliding to a different date.
  const topRow = useRef(0);
  const lastRowHeight = useRef(rowHeight);
  /**
   * While a programmatic jump is in flight this holds the destination month.
   * Without it, the smooth scroll sweeps through every month in between and the
   * heading flickers through them before settling.
   */
  const jumpTarget = useRef<string | null>(null);
  const didInitialScroll = useRef(false);
  // Row count prepended in the last update, so layout can hold position.
  const prependedRows = useRef(0);

  const total = weeks.length;

  const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const lastVisible = Math.min(
    total - 1,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN,
  );
  const topSpacer = firstVisible * rowHeight;
  const bottomSpacer = Math.max(0, (total - 1 - lastVisible) * rowHeight);

  const indexOfWeek = useCallback(
    (weekStart: string) => weeks.indexOf(weekStart),
    [weeks],
  );

  /** First week row of a month — where that month visually begins. */
  const monthStartIndex = useCallback(
    (monthKey: string) => indexOfWeek(startOfWeekKey(startOfMonthKey(monthKey))),
    [indexOfWeek],
  );

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      scrollRef.current?.scrollTo({ top: index * rowHeight, behavior });
    },
    [rowHeight],
  );

  const jumpToMonth = useCallback(
    (monthKey: string) => {
      const target = startOfMonthKey(monthKey);
      const index = monthStartIndex(target);

      // Grow the range first if the destination isn't mounted yet.
      if (index < 0) {
        setWeeks(() => buildWeeks(startOfWeekKey(target), INITIAL_WEEKS, INITIAL_WEEKS));
        jumpTarget.current = target;
        setActiveMonth(target);
        requestAnimationFrame(() => {
          const retry = weeks.indexOf(startOfWeekKey(target));
          scrollToIndex(retry >= 0 ? retry : INITIAL_WEEKS, "auto");
        });
        return;
      }

      // Commit the heading and the anchor to the destination up front, then
      // hold both there until the smooth scroll finishes.
      jumpTarget.current = target;
      topRow.current = index;
      setActiveMonth(target);
      scrollToIndex(index, "smooth");

      window.setTimeout(() => {
        jumpTarget.current = null;
      }, 500);
    },
    [monthStartIndex, scrollToIndex, weeks],
  );

  const stepMonth = useCallback(
    (delta: number) => {
      const current = new Date(`${activeMonth}T00:00:00`);
      const next = new Date(current.getFullYear(), current.getMonth() + delta, 1);
      jumpToMonth(toDateKey(next));
    },
    [activeMonth, jumpToMonth],
  );

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    setViewportHeight(container.clientHeight);

    if (!didInitialScroll.current) {
      const index = weeks.indexOf(anchorWeek);
      if (index >= 0) {
        container.scrollTop = index * rowHeight;
        topRow.current = index;
        setScrollTop(container.scrollTop);
        didInitialScroll.current = true;
      }
    }
  }, [anchorWeek, rowHeight, weeks]);

  // Keep the viewport pinned when rows are added above it.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || prependedRows.current === 0) {
      return;
    }

    container.scrollTop += prependedRows.current * rowHeight;
    topRow.current = Math.round(container.scrollTop / rowHeight);
    setScrollTop(container.scrollTop);
    prependedRows.current = 0;
  }, [weeks, rowHeight]);

  // Rows resize when the window or the active month's length changes; re-anchor
  // on the same week so the date under the heading doesn't drift.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || rowHeight === lastRowHeight.current) {
      return;
    }

    lastRowHeight.current = rowHeight;
    if (didInitialScroll.current) {
      container.scrollTop = topRow.current * rowHeight;
      setScrollTop(container.scrollTop);
    }
  }, [rowHeight]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    function onScroll() {
      const element = scrollRef.current;
      if (!element) {
        return;
      }

      setScrollTop(element.scrollTop);

      const index = Math.round(element.scrollTop / rowHeight);

      // While a jump animates, the anchor stays on its destination — sampling
      // the in-flight position would let a row-height change re-anchor the view
      // partway through the scroll.
      if (jumpTarget.current === null) {
        topRow.current = index;
      }

      // The heading is locked while a jump animates, so it can't flicker through
      // every month the smooth scroll passes over.
      if (jumpTarget.current === null) {
        const rows = Math.max(1, Math.round(element.clientHeight / rowHeight));
        const month = dominantMonth(weeks, index, index + rows - 1);
        if (month) {
          setActiveMonth((current) => (current === month ? current : month));
        }
      }

      if (index >= weeks.length - EXTEND_THRESHOLD) {
        setWeeks((current) => [
          ...current,
          ...buildWeeks(addDays(current[current.length - 1], 7), 0, EXTEND_BY - 1),
        ]);
      }

      if (index <= EXTEND_THRESHOLD) {
        prependedRows.current = EXTEND_BY;
        setWeeks((current) => [
          ...buildWeeks(addDays(current[0], -EXTEND_BY * 7), 0, EXTEND_BY - 1),
          ...current,
        ]);
      }

      if (snapTimer.current !== null) {
        window.clearTimeout(snapTimer.current);
      }

      // Once the scroll settles, ease onto a month boundary if one is nearby,
      // otherwise just align to the week row.
      snapTimer.current = window.setTimeout(() => {
        snapTimer.current = null;
        const target = scrollRef.current;
        if (!target || jumpTarget.current !== null) {
          return;
        }

        const raw = target.scrollTop / rowHeight;
        const nearestRow = Math.round(raw);

        // Snap to whichever month boundary is physically closest, rather than to
        // the month currently filling the screen. Drifting a row into November
        // should settle on November, not pull back to October.
        const boundary = nearestMonthBoundary(weeks, raw, SNAP_WITHIN_ROWS);
        const snapRow = boundary ?? nearestRow;

        const desired = snapRow * rowHeight;
        if (Math.abs(target.scrollTop - desired) > 2) {
          target.scrollTo({ top: desired, behavior: "smooth" });
        }
      }, SNAP_DELAY_MS);
    }

    const onResize = () => setViewportHeight(container.clientHeight);

    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (snapTimer.current !== null) {
        window.clearTimeout(snapTimer.current);
      }
    };
  }, [rowHeight, weeks]);

  return useMemo(
    () => ({
      weeks,
      firstVisible,
      lastVisible,
      topSpacer,
      bottomSpacer,
      activeMonth,
      scrollRef,
      jumpToMonth,
      stepMonth,
    }),
    [
      weeks,
      firstVisible,
      lastVisible,
      topSpacer,
      bottomSpacer,
      activeMonth,
      jumpToMonth,
      stepMonth,
    ],
  );
}

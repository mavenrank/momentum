export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatFriendlyDate(dateKey: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(fromDateKey(dateKey));
}

export function startOfWeekKey(dateKey: string): string {
  const date = fromDateKey(dateKey);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateKey(date);
}

export function addDays(dateKey: string, days: number): string {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function startOfMonthKey(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function addMonths(dateKey: string, months: number): string {
  const date = fromDateKey(dateKey);
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

export function formatMonth(dateKey: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(fromDateKey(dateKey));
}

/** Six-week grid covering the month, Monday-first to match the week strip. */
export function getMonthCalendarDays(dateKey: string): string[] {
  const monthStart = startOfMonthKey(dateKey);
  const calendarStart = startOfWeekKey(monthStart);

  return Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
}

export function isSameMonth(dateKey: string, monthKey: string): boolean {
  return dateKey.slice(0, 7) === monthKey.slice(0, 7);
}

export function daysInMonth(dateKey: string): number {
  const date = fromDateKey(dateKey);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Rows a Monday-first grid needs to cover the month — 4, 5 or 6 depending on
 * where the first falls. The calendar uses this to size placeholders exactly.
 */
export function getMonthWeekCount(dateKey: string): number {
  const first = fromDateKey(startOfMonthKey(dateKey));
  // Monday = 0 … Sunday = 6.
  const leadingBlanks = (first.getDay() + 6) % 7;
  return Math.ceil((leadingBlanks + daysInMonth(dateKey)) / 7);
}

/** "Wed 15" — the column header format used across the planner views. */
export function formatDayHeader(dateKey: string): string {
  const date = fromDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
  return `${weekday} ${date.getDate()}`;
}

export function formatWeekday(dateKey: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(fromDateKey(dateKey));
}

/** "Jul 7–13" or "Jun 30 – Jul 6" when the week straddles two months. */
export function formatWeekRange(weekStart: string): string {
  const start = fromDateKey(weekStart);
  const end = fromDateKey(addDays(weekStart, 6));
  const startMonth = new Intl.DateTimeFormat("en", { month: "short" }).format(start);
  const endMonth = new Intl.DateTimeFormat("en", { month: "short" }).format(end);

  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}`
    : `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
}

/** ISO-8601 week number, shown in the week view heading. */
export function getWeekNumber(dateKey: string): number {
  const date = fromDateKey(dateKey);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayOfWeek + 3);

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayOfWeek + 3);

  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/* ------------------------------------------------------------------ time -- */

/** "15:30" → 930 minutes past midnight. Null when the text isn't a clock time. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

/** 930 → "15:30". Values outside the day are clamped rather than wrapped. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface TimeRange {
  /** Minutes past midnight. */
  start: number;
  /** Minutes past midnight; always greater than `start`. */
  end: number;
}

/**
 * Reads a `timeOfDay` into a block on the clock. A task written as a single
 * moment ("15:00") is given a nominal duration so it can be drawn as a block —
 * the stored value stays a single time until the user resizes it.
 */
export function parseTimeRange(
  timeOfDay: string | undefined,
  defaultDuration = 60,
): TimeRange | null {
  if (!timeOfDay) {
    return null;
  }

  const [rawStart, rawEnd] = timeOfDay.split("-");
  const start = timeToMinutes(rawStart ?? "");
  if (start === null) {
    return null;
  }

  const end = rawEnd ? timeToMinutes(rawEnd) : null;
  // An end at or before the start is treated as unset rather than as a block
  // that runs backwards.
  if (end === null || end <= start) {
    return { start, end: Math.min(24 * 60, start + defaultDuration) };
  }
  return { start, end };
}

/** Serialises a block back into the stored `timeOfDay` form. */
export function formatTimeRangeValue(range: TimeRange): string {
  return `${minutesToTime(range.start)}-${minutesToTime(range.end)}`;
}

/** Rounds to the nearest slot — 15 minutes is the grid the timeline snaps to. */
export function snapMinutes(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

/** "15:00" → "3pm", "14:00-16:00" → "2–4pm". */
export function formatTimeOfDay(timeOfDay: string | undefined): string {
  if (!timeOfDay) {
    return "";
  }

  const formatOne = (value: string) => {
    const [hourText, minuteText] = value.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText ?? 0);
    if (Number.isNaN(hour)) {
      return value;
    }

    const meridiem = hour >= 12 ? "pm" : "am";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return minute === 0
      ? `${displayHour}${meridiem}`
      : `${displayHour}:${String(minute).padStart(2, "0")}${meridiem}`;
  };

  const [start, end] = timeOfDay.split("-");
  return end ? `${formatOne(start)}–${formatOne(end)}` : formatOne(start);
}

import { addDays, toDateKey } from "../date";
import type { TaskPriority } from "../../types/planner";

export type TokenKind = "area" | "priority" | "date" | "time" | "allDay";

export interface ParsedToken {
  kind: TokenKind;
  /** Index range into the original input line. */
  start: number;
  end: number;
  text: string;
}

export interface ParsedTask {
  title: string;
  area?: string;
  priority?: TaskPriority;
  scheduledDate?: string;
  timeOfDay?: string;
  allDay?: boolean;
  tokens: ParsedToken[];
  /** Raw line the parse came from. */
  raw: string;
}

const PRIORITY_WORDS: Record<string, TaskPriority> = {
  must: "must",
  should: "should",
  could: "could",
  want: "want",
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

interface Match {
  start: number;
  end: number;
  text: string;
}

/** Records a consumed range so later passes skip over it. */
function overlaps(taken: Match[], start: number, end: number): boolean {
  return taken.some((match) => start < match.end && end > match.start);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/* ------------------------------------------------------------------ date -- */

function nextWeekday(from: Date, weekday: number, forceNextWeek: boolean): string {
  const base = toDateKey(from);
  const current = from.getDay();
  let delta = (weekday - current + 7) % 7;

  if (delta === 0) {
    delta = 7;
  }
  if (forceNextWeek && delta < 7) {
    delta += 7;
  }

  return addDays(base, delta);
}

function resolveMonthDay(month: number, day: number, today: Date): string {
  const year = today.getFullYear();
  const candidate = new Date(year, month, day);
  // A bare "July 14" that has already passed means next year.
  const resolved =
    candidate < new Date(year, today.getMonth(), today.getDate())
      ? new Date(year + 1, month, day)
      : candidate;
  return toDateKey(resolved);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Expands a 2-digit year; 4-digit years pass through untouched. */
function expandYear(raw: string): number {
  const value = Number(raw);
  if (raw.length <= 2) {
    return 2000 + value;
  }
  return value;
}

/**
 * Resolves a numeric date written with any separator. Day-first is assumed
 * ("3-8-26" is 3 August), falling back to month-first only when day-first is
 * impossible — e.g. "12/25" can only be December 25th.
 */
function resolveNumericDate(
  parts: [string, string, string | undefined],
  today: Date,
): string | null {
  const [rawA, rawB, rawC] = parts;
  const a = Number(rawA);
  const b = Number(rawB);

  // A leading 4-digit number can only be an ISO year.
  if (rawA.length === 4) {
    if (!rawC) {
      return null;
    }
    const day = Number(rawC);
    const month = b - 1;
    if (month < 0 || month > 11 || day < 1 || day > lastDayOfMonth(a, month)) {
      return null;
    }
    return `${a}-${pad(b)}-${pad(day)}`;
  }

  let day = a;
  let month = b - 1;

  // Day-first is impossible when the second number can't be a month.
  if (b > 12) {
    if (a > 12) {
      return null;
    }
    day = b;
    month = a - 1;
  }

  if (month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }

  if (rawC) {
    const year = expandYear(rawC);
    if (day > lastDayOfMonth(year, month)) {
      return null;
    }
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }

  if (day > lastDayOfMonth(today.getFullYear(), month)) {
    return null;
  }
  return resolveMonthDay(month, day, today);
}

interface DateMatch extends Match {
  date: string;
}

function matchDate(input: string, today: Date, taken: Match[]): DateMatch | null {
  const todayKey = toDateKey(today);

  const patterns: Array<{ regex: RegExp; resolve: (m: RegExpExecArray) => string | null }> = [
    { regex: /\btoday\b/i, resolve: () => todayKey },
    { regex: /\btomorrow\b/i, resolve: () => addDays(todayKey, 1) },
    { regex: /\byesterday\b/i, resolve: () => addDays(todayKey, -1) },
    {
      regex: /\bin\s+(\d{1,3})\s+(day|days|week|weeks)\b/i,
      resolve: (m) => {
        const amount = Number(m[1]);
        const unit = m[2].toLowerCase();
        return addDays(todayKey, unit.startsWith("week") ? amount * 7 : amount);
      },
    },
    {
      regex: new RegExp(`\\b(next|this)\\s+(${WEEKDAYS.join("|")})\\b`, "i"),
      resolve: (m) =>
        nextWeekday(today, WEEKDAYS.indexOf(m[2].toLowerCase()), m[1].toLowerCase() === "next"),
    },
    { regex: /\bnext\s+week\b/i, resolve: () => addDays(todayKey, 7) },
    {
      regex: new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "i"),
      resolve: (m) => nextWeekday(today, WEEKDAYS.indexOf(m[1].toLowerCase()), false),
    },
    {
      // "July 14" / "14 July" / "Jul 14th"
      regex: new RegExp(
        `\\b(${MONTHS.map((month) => month.slice(0, 3)).join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
        "i",
      ),
      resolve: (m) => {
        const month = MONTHS.findIndex((name) => name.startsWith(m[1].toLowerCase()));
        const day = Number(m[2]);
        return month >= 0 && day >= 1 && day <= 31 ? resolveMonthDay(month, day, today) : null;
      },
    },
    {
      regex: new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.map((month) => month.slice(0, 3)).join("|")})[a-z]*\\b`,
        "i",
      ),
      resolve: (m) => {
        const day = Number(m[1]);
        const month = MONTHS.findIndex((name) => name.startsWith(m[2].toLowerCase()));
        return month >= 0 && day >= 1 && day <= 31 ? resolveMonthDay(month, day, today) : null;
      },
    },
    {
      // Any separator, with a year: "3-8-26", "03.08.2026", "14/7/2026",
      // "2026-07-14". The separator must be consistent across both positions.
      regex: /\b(\d{1,4})([/.-])(\d{1,2})\2(\d{2,4})\b/,
      resolve: (m) => resolveNumericDate([m[1], m[3], m[4]], today),
    },
    {
      // Any separator, no year: "14/7", "3-8", "3.8".
      regex: /\b(\d{1,2})([/.-])(\d{1,2})\b/,
      resolve: (m) => resolveNumericDate([m[1], m[3], undefined], today),
    },
    {
      // Compact 8-digit: "03082026" (ddmmyyyy) or "20260803" (yyyymmdd).
      regex: /\b(\d{8})\b/,
      resolve: (m) => {
        const digits = m[1];
        const leadingYear = Number(digits.slice(0, 4));
        if (leadingYear >= 1900 && leadingYear <= 2999) {
          return resolveNumericDate(
            [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)],
            today,
          );
        }
        return resolveNumericDate(
          [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)],
          today,
        );
      },
    },
  ];

  for (const pattern of patterns) {
    const match = pattern.regex.exec(input);
    if (!match || overlaps(taken, match.index, match.index + match[0].length)) {
      continue;
    }

    const date = pattern.resolve(match);
    if (date) {
      return { start: match.index, end: match.index + match[0].length, text: match[0], date };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ time -- */

function to24Hour(hour: number, minute: number, meridiem: string | undefined): string {
  let resolved = hour;
  const suffix = meridiem?.toLowerCase();

  if (suffix === "pm" && hour < 12) {
    resolved = hour + 12;
  }
  if (suffix === "am" && hour === 12) {
    resolved = 0;
  }

  return `${pad(resolved)}:${pad(minute)}`;
}

interface TimeMatch extends Match {
  time: string;
}

function matchTime(input: string, taken: Match[]): TimeMatch | null {
  const patterns: Array<{ regex: RegExp; resolve: (m: RegExpExecArray) => string | null }> = [
    {
      // Range: "2-4pm", "14:00-16:00", "9am-5pm"
      regex: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
      resolve: (m) => {
        const endMeridiem = m[6];
        const startMeridiem = m[3] ?? endMeridiem;
        const startHour = Number(m[1]);
        const endHour = Number(m[4]);
        if (startHour > 23 || endHour > 23) {
          return null;
        }
        // A bare "2-4" with no meridiem and no colon is more likely a number range.
        if (!startMeridiem && !endMeridiem && !m[2] && !m[5]) {
          return null;
        }
        const start = to24Hour(startHour, Number(m[2] ?? 0), startMeridiem);
        const end = to24Hour(endHour, Number(m[5] ?? 0), endMeridiem);
        return `${start}-${end}`;
      },
    },
    {
      // "3pm", "3:30pm"
      regex: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
      resolve: (m) => {
        const hour = Number(m[1]);
        return hour <= 12 ? to24Hour(hour, Number(m[2] ?? 0), m[3]) : null;
      },
    },
    {
      // 24-hour "15:00"
      regex: /\b([01]?\d|2[0-3]):([0-5]\d)\b/,
      resolve: (m) => `${pad(Number(m[1]))}:${m[2]}`,
    },
  ];

  for (const pattern of patterns) {
    const match = pattern.regex.exec(input);
    if (!match || overlaps(taken, match.index, match.index + match[0].length)) {
      continue;
    }

    const time = pattern.resolve(match);
    if (time) {
      return { start: match.index, end: match.index + match[0].length, text: match[0], time };
    }
  }

  return null;
}

/* ---------------------------------------------------------------- parser -- */

export interface ParseOptions {
  /** Reference date for relative expressions. Defaults to now. */
  today?: Date;
  /** Known area names, used to prefer an exact match over a new area. */
  knownAreas?: string[];
}

/** Parses a single line into structured task fields. */
export function parseTaskLine(line: string, options: ParseOptions = {}): ParsedTask {
  const today = options.today ?? new Date();
  const taken: Match[] = [];
  const tokens: ParsedToken[] = [];

  let area: string | undefined;
  let priority: TaskPriority | undefined;
  let scheduledDate: string | undefined;
  let timeOfDay: string | undefined;
  let allDay: boolean | undefined;

  // 1. Area — #tag
  const areaMatch = /(^|\s)#([\p{L}\p{N}_-]+)/u.exec(line);
  if (areaMatch) {
    const start = areaMatch.index + areaMatch[1].length;
    const end = start + areaMatch[2].length + 1;
    const typed = areaMatch[2];
    const known = options.knownAreas?.find(
      (candidate) => candidate.toLowerCase() === typed.toLowerCase(),
    );

    area = known ?? typed;
    taken.push({ start, end, text: line.slice(start, end) });
    tokens.push({ kind: "area", start, end, text: line.slice(start, end) });
  }

  // 2. Priority — must / should / could / want
  const priorityMatch = /\b(must|should|could|want)\b/i.exec(line);
  if (priorityMatch && !overlaps(taken, priorityMatch.index, priorityMatch.index + priorityMatch[0].length)) {
    const start = priorityMatch.index;
    const end = start + priorityMatch[0].length;
    priority = PRIORITY_WORDS[priorityMatch[1].toLowerCase()];
    taken.push({ start, end, text: priorityMatch[0] });
    tokens.push({ kind: "priority", start, end, text: priorityMatch[0] });
  }

  // 3. All-day marker, claimed before times so "all day" is never mistaken for
  //    part of a time expression.
  const allDayMatch = /\b(all[\s-]?day|allday)\b/i.exec(line);
  if (allDayMatch && !overlaps(taken, allDayMatch.index, allDayMatch.index + allDayMatch[0].length)) {
    const start = allDayMatch.index;
    const end = start + allDayMatch[0].length;
    allDay = true;
    taken.push({ start, end, text: allDayMatch[0] });
    tokens.push({ kind: "allDay", start, end, text: allDayMatch[0] });
  }

  // 4. Time before date, so "2-4pm" is not eaten by the "14/7" date pattern.
  //    An explicit all-day marker wins: the two are mutually exclusive.
  const time = allDay ? null : matchTime(line, taken);
  if (time) {
    timeOfDay = time.time;
    taken.push(time);
    tokens.push({ kind: "time", start: time.start, end: time.end, text: time.text });
  }

  // 5. Date
  const date = matchDate(line, today, taken);
  if (date) {
    scheduledDate = date.date;
    taken.push(date);
    tokens.push({ kind: "date", start: date.start, end: date.end, text: date.text });
  }

  // 6. Whatever is left is the title.
  const ordered = [...taken].sort((a, b) => a.start - b.start);
  let title = "";
  let cursor = 0;
  for (const match of ordered) {
    title += line.slice(cursor, match.start);
    cursor = match.end;
  }
  title += line.slice(cursor);

  tokens.sort((a, b) => a.start - b.start);

  return {
    title: title.replace(/\s{2,}/g, " ").replace(/^[\s\-–—*•\d.)]+/, "").trim(),
    area,
    priority,
    scheduledDate,
    timeOfDay,
    allDay,
    tokens,
    raw: line,
  };
}

/** Splits a pasted block on newlines and parses each non-empty line. */
export function parseTaskInput(input: string, options: ParseOptions = {}): ParsedTask[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseTaskLine(line, options))
    .filter((parsed) => parsed.title.length > 0);
}

/** Splits a line into highlighted and plain segments for the inline preview. */
export interface HighlightSegment {
  text: string;
  kind: TokenKind | null;
}

export function toHighlightSegments(parsed: ParsedTask): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const token of parsed.tokens) {
    if (token.start > cursor) {
      segments.push({ text: parsed.raw.slice(cursor, token.start), kind: null });
    }
    segments.push({ text: parsed.raw.slice(token.start, token.end), kind: token.kind });
    cursor = token.end;
  }

  if (cursor < parsed.raw.length) {
    segments.push({ text: parsed.raw.slice(cursor), kind: null });
  }

  return segments;
}

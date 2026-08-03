import { describe, expect, test } from "bun:test";
import { parseTaskInput, parseTaskLine } from "./taskParser";
import { compareByTiming, TASK_PRIORITIES } from "../../types/planner";

/** Sunday 2 August 2026 — the fixed "today" every relative case resolves from. */
const today = new Date(2026, 7, 2);
const knownAreas = [
  "College",
  "Work",
  "Projects",
  "Health",
  "Personal",
  "Finance",
  "Relationships",
];

function parse(input: string) {
  return parseTaskLine(input, { today, knownAreas });
}

describe("relative dates", () => {
  test.each([
    ["today", "2026-08-02"],
    ["tomorrow", "2026-08-03"],
    ["yesterday", "2026-08-01"],
    ["in 3 days", "2026-08-05"],
    ["in 2 weeks", "2026-08-16"],
    ["next week", "2026-08-09"],
    ["friday", "2026-08-07"],
    ["next monday", "2026-08-10"],
  ])("%s resolves to %s", (phrase, expected) => {
    expect(parse(`Ship it ${phrase}`).scheduledDate).toBe(expected);
  });
});

describe("numeric dates", () => {
  test.each([
    // Day-first is the default reading, across every separator.
    ["3-8-26", "2026-08-03"],
    ["3-8-2026", "2026-08-03"],
    ["03-08-2026", "2026-08-03"],
    ["3.8.26", "2026-08-03"],
    ["03.08.2026", "2026-08-03"],
    ["3/8/26", "2026-08-03"],
    ["25/12/2026", "2026-12-25"],
    ["3-8", "2026-08-03"],
    ["14/7", "2027-07-14"],
    // ISO and compact forms.
    ["2026-07-14", "2026-07-14"],
    ["03082026", "2026-08-03"],
    ["20260803", "2026-08-03"],
    // Day-first is impossible here, so it falls back to month-first.
    ["12/25", "2026-12-25"],
  ])("%s resolves to %s", (phrase, expected) => {
    expect(parse(`Submit form ${phrase}`).scheduledDate).toBe(expected);
  });

  test.each([
    ["31-2-26", "February has no 31st"],
    ["45-99-26", "neither number can be a month"],
  ])("%s is rejected (%s)", (phrase) => {
    const parsed = parse(`Submit form ${phrase}`);
    expect(parsed.scheduledDate).toBeUndefined();
    expect(parsed.title).toContain(phrase);
  });
});

describe("month names", () => {
  test.each([
    ["July 14", "2027-07-14"],
    ["14 Jul", "2027-07-14"],
    ["Aug 20", "2026-08-20"],
    ["20th August", "2026-08-20"],
  ])("%s resolves to %s", (phrase, expected) => {
    expect(parse(`Report ${phrase}`).scheduledDate).toBe(expected);
  });
});

describe("times", () => {
  test.each([
    ["3pm", "15:00"],
    ["9:30am", "09:30"],
    ["15:00", "15:00"],
    ["2-4pm", "14:00-16:00"],
    ["9am-5pm", "09:00-17:00"],
    ["14:00-16:00", "14:00-16:00"],
  ])("%s resolves to %s", (phrase, expected) => {
    expect(parse(`Deep work ${phrase}`).timeOfDay).toBe(expected);
  });

  test("a bare number range is not a time", () => {
    expect(parse("Buy 2-4 apples").timeOfDay).toBeUndefined();
  });
});

describe("all-day tasks", () => {
  test.each(["all day", "all-day", "allday", "All Day"])(
    "%s marks the task as all-day",
    (phrase) => {
      const parsed = parse(`Conference ${phrase} friday`);
      expect(parsed.allDay).toBe(true);
      expect(parsed.timeOfDay).toBeUndefined();
      expect(parsed.scheduledDate).toBe("2026-08-07");
      expect(parsed.title).toBe("Conference");
    },
  );

  test("an all-day marker wins over a time in the same line", () => {
    const parsed = parse("Offsite all day 3pm");
    expect(parsed.allDay).toBe(true);
    expect(parsed.timeOfDay).toBeUndefined();
  });

  test("a plain timed task is not all-day", () => {
    const parsed = parse("Standup 9am");
    expect(parsed.allDay).toBeUndefined();
    expect(parsed.timeOfDay).toBe("09:00");
  });
});

describe("timing order", () => {
  test("all-day sorts above timed, timed sorts by the clock", () => {
    const make = (title: string, timeOfDay?: string, allDay?: boolean) =>
      ({
        id: title,
        title,
        status: "scheduled",
        timeOfDay,
        allDay,
        relationships: { dependsOn: [], blocks: [], related: [] },
        createdAt: "",
        updatedAt: "",
      }) as never;

    const sorted = [
      make("afternoon", "15:00"),
      make("anytime"),
      make("offsite", undefined, true),
      make("morning", "09:00"),
    ]
      .sort(compareByTiming)
      .map((task: { title: string }) => task.title);

    expect(sorted).toEqual(["offsite", "morning", "afternoon", "anytime"]);
  });
});

describe("priority and area", () => {
  test.each(TASK_PRIORITIES)("%s is recognised", (word) => {
    expect(parse(`Do the thing ${word}`).priority).toBe(word);
  });

  test("priority words are case-insensitive", () => {
    expect(parse("Do the thing MUST").priority).toBe("must");
  });

  test("a known area keeps its canonical casing", () => {
    expect(parse("Run #health").area).toBe("Health");
  });

  test("an unknown area is kept verbatim for creation", () => {
    expect(parse("Run #gardening").area).toBe("gardening");
  });
});

describe("titles", () => {
  test("every recognised token is stripped out", () => {
    expect(parse("Buy groceries tomorrow 3pm must #health").title).toBe("Buy groceries");
  });

  test("plain numbers survive in the title", () => {
    const parsed = parse("Buy 3 apples");
    expect(parsed.title).toBe("Buy 3 apples");
    expect(parsed.scheduledDate).toBeUndefined();
  });

  test("list bullets are trimmed", () => {
    expect(parse("- Read the paper").title).toBe("Read the paper");
    expect(parse("1. Read the paper").title).toBe("Read the paper");
  });
});

describe("multi-line input", () => {
  test("each line parses independently and blanks are dropped", () => {
    const tasks = parseTaskInput(
      ["- Buy milk tomorrow", "", "2. Call the dentist friday 9am must", "   "].join("\n"),
      { today, knownAreas },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ title: "Buy milk", scheduledDate: "2026-08-03" });
    expect(tasks[1]).toMatchObject({
      title: "Call the dentist",
      scheduledDate: "2026-08-07",
      timeOfDay: "09:00",
      priority: "must",
    });
  });
});

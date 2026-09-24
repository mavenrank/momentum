import { describe, expect, test } from "bun:test";

import { getMonthPageSlots } from "./date";

describe("horizontal calendar month pages", () => {
  test("the first day stays in the first week with adjacent dates on both sides", () => {
    const september = getMonthPageSlots("2026-09-01");
    expect(september.length).toBe(35);
    expect(september.slice(0, 7)).toEqual(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(september.at(-1)).toBe("2026-10-04");
  });

  test("uses exactly the rows each month needs", () => {
    expect(getMonthPageSlots("2027-02-01").length).toBe(28);
    expect(getMonthPageSlots("2026-08-01").length).toBe(42);
  });
});

import { describe, expect, test } from "bun:test";

import { addTask, createEmptyData } from "./plannerData";
import { consolidateDuplicateDomains, sortDomainsForDisplay } from "./organization";

describe("Domain organization", () => {
  test("consolidates duplicate names while preserving Area and task references", () => {
    const base = createEmptyData();
    const work = base.domains.find((domain) => domain.name === "Work")!;
    const duplicate = { ...work, id: "second-work", createdAt: "2026-09-01T00:00:00.000Z" };
    const withDuplicates = {
      ...base,
      domains: [...base.domains, duplicate],
      areas: [...base.areas, { ...base.areas[0], id: "portfolio", name: "Portfolio", domainId: duplicate.id }],
    };
    const withTask = addTask(withDuplicates, { title: "Review proposal", domainId: duplicate.id }, { now: new Date("2026-09-02T10:00:00Z"), deviceTag: "tt" });
    const repaired = consolidateDuplicateDomains(withTask);

    expect(repaired.domains.filter((domain) => domain.name === "Work")).toHaveLength(1);
    const canonicalId = repaired.domains.find((domain) => domain.name === "Work")!.id;
    expect(repaired.areas.filter((area) => area.name === "Portfolio" || area.id === base.areas[0].id).map((area) => area.domainId))
      .toEqual([canonicalId, canonicalId]);
    expect(Object.values(repaired.daily).flatMap((entry) => entry.tasks)[0].domainId).toBe(canonicalId);
    expect(consolidateDuplicateDomains(repaired)).toBe(repaired);
  });

  test("keeps duplicate Domains when their Areas would collide", () => {
    const base = createEmptyData();
    const work = base.domains.find((domain) => domain.name === "Work")!;
    const duplicate = { ...work, id: "second-work" };
    const colliding = {
      ...base,
      domains: [...base.domains, duplicate],
      areas: [...base.areas, { ...base.areas[0], id: "second-general", domainId: duplicate.id }],
    };
    expect(consolidateDuplicateDomains(colliding)).toBe(colliding);
  });

  test("places broad Domains first and the import holding Domain last", () => {
    const base = createEmptyData();
    const sorted = sortDomainsForDisplay([{ ...base.domains[0], name: "To organize" }, base.domains[1], { ...base.domains[0], name: "Work" }]);
    expect(sorted.map((domain) => domain.name)).toEqual(["Work", "Personal", "To organize"]);
  });
});

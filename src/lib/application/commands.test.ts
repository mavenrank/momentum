import { describe, expect, test } from "bun:test";

import { executePlannerCommand, executePlannerCommands } from "./commands";
import { createEmptyData } from "../plannerData";
import { validateImport } from "../plannerData";
import type { DailyTask } from "../../types/planner";

const context = {
  now: new Date("2026-08-25T10:00:00.000Z"),
  deviceTag: "tt",
  createEntityId: (() => {
    let next = 0;
    return () => `entity-${++next}`;
  })(),
};

describe("planner commands", () => {
  test("links related tasks in both directions and removes the link", () => {
    const first = executePlannerCommand(createEmptyData(), { type: "task.create", input: { title: "First" } }, context);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = executePlannerCommand(first.data, { type: "task.create", input: { title: "Second" } }, context);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const firstId = (first.value as DailyTask).id;
    const secondId = (second.value as DailyTask).id;
    const linked = executePlannerCommand(second.data, { type: "task.linkRelated", taskId: firstId, otherTaskId: secondId }, context);
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    const linkedTasks = Object.values(linked.data.daily).flatMap((day) => day.tasks);
    expect(linkedTasks.find((task) => task.id === firstId)?.relationships.related).toEqual([secondId]);
    expect(linkedTasks.find((task) => task.id === secondId)?.relationships.related).toEqual([firstId]);
    expect(executePlannerCommand(linked.data, { type: "task.linkRelated", taskId: firstId, otherTaskId: firstId }, context).ok).toBe(false);
    const unlinked = executePlannerCommand(linked.data, { type: "task.unlinkRelated", taskId: firstId, otherTaskId: secondId }, context);
    expect(unlinked.ok).toBe(true);
    if (!unlinked.ok) return;
    expect(Object.values(unlinked.data.daily).flatMap((day) => day.tasks).every((task) => task.relationships.related.length === 0)).toBe(true);
  });
  test("allows duplicate Area and Pursuit names in separate homes", () => {
    const base = createEmptyData();
    const work = base.domains.find((domain) => domain.name === "Work")!;
    const personal = base.domains.find((domain) => domain.name === "Personal")!;
    const workArea = executePlannerCommand(base, { type: "area.create", name: "Learning", domainId: work.id }, context);
    expect(workArea.ok).toBe(true);
    if (!workArea.ok) return;
    const personalArea = executePlannerCommand(workArea.data, { type: "area.create", name: "Learning", domainId: personal.id }, context);
    expect(personalArea.ok).toBe(true);
    if (!personalArea.ok) return;
    const ambiguous = executePlannerCommand(personalArea.data, { type: "task.create", input: { title: "Read", area: "Learning" } }, context);
    expect(ambiguous.ok).toBe(false);
    const first = executePlannerCommand(personalArea.data, { type: "pursuit.create", name: "Research", homeAreaId: (workArea.value as { id: string }).id }, context);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = executePlannerCommand(first.data, { type: "pursuit.create", name: "Research", homeAreaId: (personalArea.value as { id: string }).id }, context);
    expect(second.ok).toBe(true);
  });

  test("participating Areas admit tasks and cannot be removed while they hold Pursuit tasks", () => {
    const base = createEmptyData();
    const work = base.areas.find((area) => area.domainId === base.domains.find((domain) => domain.name === "Work")?.id)!;
    const health = base.areas.find((area) => area.name === "Health")!;
    const created = executePlannerCommand(base, { type: "pursuit.create", name: "Wellness initiative", homeAreaId: work.id }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pursuitId = (created.value as { id: string }).id;
    const blocked = executePlannerCommand(created.data, { type: "task.create", input: { title: "Book a checkup", area: health.id, pursuitId } }, context);
    expect(blocked.ok).toBe(false);
    const linked = executePlannerCommand(created.data, { type: "pursuit.update", pursuitId, patch: { participatingAreaIds: [health.id] } }, context);
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    const task = executePlannerCommand(linked.data, { type: "task.create", input: { title: "Book a checkup", area: health.id, pursuitId } }, context);
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    const unlinked = executePlannerCommand(task.data, { type: "pursuit.update", pursuitId, patch: { participatingAreaIds: [] } }, context);
    expect(unlinked.ok).toBe(false);
    const moved = executePlannerCommand(task.data, { type: "task.update", taskId: (task.value as DailyTask).id, patch: { area: work.id } }, context);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(executePlannerCommand(moved.data, { type: "pursuit.update", pursuitId, patch: { participatingAreaIds: [] } }, context).ok).toBe(true);
  });

  test("archived Domains preserve historical tasks but reject new classification", () => {
    const base = createEmptyData();
    const work = base.domains.find((domain) => domain.name === "Work")!;
    const created = executePlannerCommand(base, { type: "task.create", input: { title: "Old standalone", domainId: work.id } }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const archived = executePlannerCommand(created.data, { type: "domain.update", domainId: work.id, patch: { archived: true } }, context);
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(executePlannerCommand(archived.data, { type: "task.create", input: { title: "New standalone", domainId: work.id } }, context).ok).toBe(false);
    expect(executePlannerCommand(archived.data, { type: "task.update", taskId: (created.value as DailyTask).id, patch: { title: "Renamed standalone" } }, context).ok).toBe(true);
  });

  test("moving a Pursuit home preserves its old Area as a participant", () => {
    const base = createEmptyData();
    const first = base.areas.find((area) => area.domainId === base.domains.find((domain) => domain.name === "Work")?.id)!;
    const second = base.areas.find((area) => area.name === "Health")!;
    const created = executePlannerCommand(base, { type: "pursuit.create", name: "Initiative", homeAreaId: first.id }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pursuitId = (created.value as { id: string }).id;
    const task = executePlannerCommand(created.data, { type: "task.create", input: { title: "First stream", pursuitId } }, context);
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    const moved = executePlannerCommand(task.data, { type: "pursuit.update", pursuitId, patch: { homeAreaId: second.id } }, context);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.data.pursuits[0].homeAreaId).toBe(second.id);
    expect(moved.data.pursuits[0].participatingAreaIds).toContain(first.id);
  });

  test("legacy broad tags assign a Domain without inventing an Area", () => {
    const base = createEmptyData();
    const created = executePlannerCommand(base, { type: "task.create", input: { title: "Plan", area: "Work" } }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((created.value as DailyTask).area).toBeUndefined();
    expect((created.value as DailyTask).domainId).toBe(base.domains.find((domain) => domain.name === "Work")?.id);
    expect(created.data.areas.length).toBe(base.areas.length);
  });

  test("creates unknown areas and canonicalises their use", () => {
    const result = executePlannerCommand(
      createEmptyData(),
      {
        type: "task.create",
        input: { title: "Plant basil", area: "Gardening" },
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas.some((area) => area.name === "Gardening")).toBe(true);
    expect((result.value as DailyTask).area).toBe(result.data.areas.find((area) => area.name === "Gardening")?.id);
  });

  test("area renames retain stable task references", () => {
    const created = executePlannerCommand(createEmptyData(), {
      type: "task.create", input: { title: "Prepare presentation", area: "Work / General" },
    }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const area = created.data.areas.find((entry) => entry.domainId === created.data.domains.find((domain) => domain.name === "Work")?.id)!;
    const renamed = executePlannerCommand(created.data, {
      type: "area.update", areaId: area.id, patch: { name: "Career" },
    }, context);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect((renamed.data.daily["2026-08-25"].tasks[0]).area).toBe(area.id);
    expect(renamed.data.areas.find((entry) => entry.id === area.id)?.name).toBe("Career");
  });

  test("archived areas remain on old tasks but cannot be assigned again", () => {
    const data = createEmptyData();
    const work = data.areas.find((entry) => entry.domainId === data.domains.find((domain) => domain.name === "Work")?.id)!;
    const created = executePlannerCommand(data, {
      type: "task.create", input: { title: "Old work", area: work.id },
    }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const archived = executePlannerCommand(created.data, {
      type: "area.update", areaId: work.id, patch: { archived: true },
    }, context);
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(archived.data.daily["2026-08-25"].tasks[0].area).toBe(work.id);
    expect(executePlannerCommand(archived.data, {
      type: "task.create", input: { title: "New work", area: work.id },
    }, context).ok).toBe(false);
    const existing = archived.data.daily["2026-08-25"].tasks[0];
    expect(executePlannerCommand(archived.data, {
      type: "task.schedule", taskId: existing.id, date: "2026-08-26",
    }, context).ok).toBe(true);
  });

  test("merging areas moves task references and pursuit defaults, then archives the source", () => {
    const data = createEmptyData();
    const work = data.areas.find((entry) => entry.domainId === data.domains.find((domain) => domain.name === "Work")?.id)!;
    const personal = data.areas.find((entry) => entry.domainId === data.domains.find((domain) => domain.name === "Personal")?.id && entry.name === "General")!;
    const createdPursuit = executePlannerCommand(data, {
      type: "pursuit.create", name: "Website", homeAreaId: work.id,
    }, context);
    expect(createdPursuit.ok).toBe(true);
    if (!createdPursuit.ok) return;
    const createdTask = executePlannerCommand(createdPursuit.data, {
      type: "task.create", input: { title: "Ship header", pursuitId: (createdPursuit.value as { id: string }).id },
    }, context);
    expect(createdTask.ok).toBe(true);
    if (!createdTask.ok) return;
    expect((createdTask.value as DailyTask).area).toBe(work.id);
    const merged = executePlannerCommand(createdTask.data, {
      type: "area.merge", sourceId: work.id, targetId: personal.id,
    }, context);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.data.daily["2026-08-25"].tasks[0].area).toBe(personal.id);
    expect(merged.data.pursuits[0].homeAreaId).toBe(personal.id);
    expect(merged.data.areas.find((entry) => entry.id === work.id)?.archived).toBe(true);
    expect(executePlannerCommand(merged.data, {
      type: "area.merge", sourceId: personal.id, targetId: work.id,
    }, context).ok).toBe(false);
  });

  test("pursuits preserve old tasks while held and require closed tasks for completion", () => {
    const base = createEmptyData();
    const created = executePlannerCommand(base, {
      type: "pursuit.create", name: "Thesis", homeAreaId: base.areas[0].id,
    }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pursuitId = (created.value as { id: string }).id;
    const task = executePlannerCommand(created.data, {
      type: "task.create", input: { title: "Draft chapter", pursuitId },
    }, context);
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    const taskId = (task.value as DailyTask).id;
    const held = executePlannerCommand(task.data, {
      type: "pursuit.update", pursuitId, patch: { status: "on_hold" },
    }, context);
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(executePlannerCommand(held.data, {
      type: "task.create", input: { title: "Next chapter", pursuitId },
    }, context).ok).toBe(false);
    expect(executePlannerCommand(held.data, {
      type: "pursuit.update", pursuitId, patch: { status: "completed" },
    }, context).ok).toBe(false);
    const done = executePlannerCommand(held.data, { type: "task.toggleDone", taskId }, context);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const completed = executePlannerCommand(done.data, {
      type: "pursuit.update", pursuitId, patch: { status: "completed" },
    }, context);
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(executePlannerCommand(completed.data, { type: "task.toggleDone", taskId }, context).ok).toBe(false);
    const resumed = executePlannerCommand(completed.data, {
      type: "pursuit.update", pursuitId, patch: { status: "active" },
    }, context);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(executePlannerCommand(resumed.data, { type: "task.toggleDone", taskId }, context).ok).toBe(true);
  });

  test("v2 backup area names become IDs and unknown names are kept as areas", () => {
    const data = createEmptyData();
    const work = { id: "legacy-work", name: "Work", color: "#a45c40", createdAt: "2026-08-25T10:00:00.000Z", archived: false };
    data.daily["2026-08-25"] = {
      date: "2026-08-25", note: "", taskReferences: [],
      tasks: [
        { id: "T-20260825-0001-tt", title: "Old task", status: "pool", area: "Work", relationships: { dependsOn: [], blocks: [], related: [] }, createdAt: "2026-08-25T10:00:00.000Z", updatedAt: "2026-08-25T10:00:00.000Z" },
        { id: "T-20260825-0002-tt", title: "Orphan area", status: "pool", area: "Rare niche", relationships: { dependsOn: [], blocks: [], related: [] }, createdAt: "2026-08-25T10:00:00.000Z", updatedAt: "2026-08-25T10:00:00.000Z" },
      ],
    };
    const legacy = { ...data, version: 2, areas: [work], domains: undefined, pursuits: undefined };
    const imported = validateImport(legacy);
    expect(imported?.version).toBe(4);
    expect(imported?.daily["2026-08-25"].tasks[0].area).toBe(work.id);
    const orphanId = imported?.daily["2026-08-25"].tasks[1].area;
    expect(imported?.areas.find((entry) => entry.id === orphanId)?.name).toBe("Rare niche");
  });

  test("v3 migration retains one Pursuit across multiple Areas", () => {
    const now = "2026-08-25T10:00:00.000Z";
    const legacy = {
      version: 3, daily: { "2026-08-25": { date: "2026-08-25", note: "", taskReferences: [], tasks: [
        { id: "T-20260825-0001-tt", title: "Work stream", status: "pool", area: "work-area", pursuitId: "p1", relationships: { dependsOn: [], blocks: [], related: [] }, createdAt: now, updatedAt: now },
        { id: "T-20260825-0002-tt", title: "Health stream", status: "pool", area: "health-area", pursuitId: "p1", relationships: { dependsOn: [], blocks: [], related: [] }, createdAt: now, updatedAt: now },
      ] } }, weekly: {}, habits: [], habitLogs: [], nextTaskId: 3, updatedAt: now,
      areas: [
        { id: "work-area", name: "Work", color: "#a45c40", createdAt: now, archived: false },
        { id: "health-area", name: "Health", color: "#5b8c5a", createdAt: now, archived: false },
      ], pursuits: [{ id: "p1", name: "Initiative", status: "active", createdAt: now, updatedAt: now, defaultAreaId: "work-area" }],
    };
    const imported = validateImport(legacy);
    expect(imported?.version).toBe(4);
    expect(imported?.pursuits[0].homeAreaId).toBe("work-area");
    expect(imported?.pursuits[0].participatingAreaIds).toEqual(["health-area"]);
    expect(imported?.daily["2026-08-25"].tasks.map((task) => task.area)).toEqual(["work-area", "health-area"]);
  });

  test("rejects a conflicting CLI-style command without modifying data", () => {
    const first = executePlannerCommand(
      createEmptyData(),
      {
        type: "task.create",
        input: {
          title: "First",
          scheduledDate: "2026-08-26",
          timeOfDay: "09:00-10:00",
        },
      },
      context,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = executePlannerCommand(
      first.data,
      {
        type: "task.create",
        input: {
          title: "Second",
          scheduledDate: "2026-08-26",
          timeOfDay: "09:30-10:30",
        },
        conflictPolicy: "reject",
      },
      context,
    );

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("TIME_CONFLICT");
    expect(second.data).toBe(first.data);
  });

  test("warns but accepts a UI-style conflict", () => {
    const result = executePlannerCommands(
      createEmptyData(),
      [
        {
          type: "task.create",
          input: {
            title: "First",
            scheduledDate: "2026-08-26",
            timeOfDay: "09:00-10:00",
          },
        },
        {
          type: "task.create",
          input: {
            title: "Second",
            scheduledDate: "2026-08-26",
            timeOfDay: "09:30-10:30",
          },
          conflictPolicy: "warn",
        },
      ],
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  test("keeps batches atomic on failure", () => {
    const original = createEmptyData();
    const result = executePlannerCommands(
      original,
      [
        { type: "task.create", input: { title: "Valid" } },
        { type: "task.create", input: { title: "" } },
      ],
      context,
    );

    expect(result.ok).toBe(false);
    expect(result.data).toBe(original);
  });

  test("journal writes preserve full tagged references", () => {
    const result = executePlannerCommand(
      createEmptyData(),
      {
        type: "journal.set",
        date: "2026-08-25",
        note: "Worked on @T-20260825-0042-ab",
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.daily["2026-08-25"].taskReferences).toEqual([
      "T-20260825-0042-ab",
    ]);
  });
});

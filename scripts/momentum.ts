#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import {
  executePlannerCommand,
  executePlannerCommands,
  type ConflictPolicy,
  type PlannerCommand,
  type PlannerCommandResult,
  type TaskPatch,
} from "../src/lib/application/commands";
import { validatePlannerData } from "../src/lib/application/validateData";
import { parseTaskLine } from "../src/lib/nlp/taskParser";
import { allTasks, normalizePlannerData, validateImport } from "../src/lib/plannerData";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type DailyTask,
  type TaskPriority,
  type TaskStatus,
} from "../src/types/planner";
import {
  readCliStore,
  withCliStoreLock,
  writeCliStore,
  type AuditEntry,
  type CliStore,
} from "./lib/cliStore";

const BOOLEAN_FLAGS = new Set([
  "all-day",
  "allow-conflict",
  "warn-conflict",
  "dry-run",
  "json",
  "stdin",
  "help",
]);

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

interface CliResponse {
  ok: boolean;
  command: string;
  revision?: number;
  message: string;
  result?: unknown;
  warnings?: unknown[];
  error?: { code: string; message: string; details?: unknown };
  dryRun?: boolean;
  replayed?: boolean;
}

class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly exitCode = 2,
  ) {
    super(message);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }

    const [rawName, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags[rawName] = inlineValue;
      continue;
    }
    if (BOOLEAN_FLAGS.has(rawName)) {
      flags[rawName] = true;
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new CliError("MISSING_FLAG_VALUE", `--${rawName} requires a value.`);
    }
    flags[rawName] = next;
    index += 1;
  }

  return { positional, flags };
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function requireValue(args: ParsedArgs, name: string): string {
  const value = flagString(args, name);
  if (!value) {
    throw new CliError("MISSING_ARGUMENT", `--${name} is required.`);
  }
  return value;
}

function defaultDataPath(): string {
  const platformData =
    process.env.LOCALAPPDATA ??
    process.env.XDG_DATA_HOME ??
    process.env.APPDATA ??
    join(homedir(), ".local", "share");
  return join(platformData, "Momentum", "cli-store.json");
}

function dataPath(args: ParsedArgs): string {
  const configured = flagString(args, "data") ?? process.env.MOMENTUM_DATA_PATH;
  if (!configured) return defaultDataPath();
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function conflictPolicy(args: ParsedArgs): ConflictPolicy {
  if (args.flags["allow-conflict"]) return "allow";
  if (args.flags["warn-conflict"]) return "warn";
  return "reject";
}

function commandNow(args: ParsedArgs): Date {
  const raw = flagString(args, "now") ?? process.env.MOMENTUM_TEST_NOW;
  if (!raw) return new Date();
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new CliError("INVALID_NOW", `Invalid --now timestamp: ${raw}.`);
  }
  return value;
}

function expectedRevision(args: ParsedArgs): number | undefined {
  const raw = flagString(args, "expected-revision");
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new CliError("INVALID_REVISION", "--expected-revision must be a non-negative integer.");
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function actor(args: ParsedArgs): AuditEntry["actor"] {
  const value = flagString(args, "actor") ?? "cli";
  if (value !== "cli" && value !== "llm" && value !== "test") {
    throw new CliError("INVALID_ACTOR", "--actor must be cli, llm, or test.");
  }
  return value;
}

function summarizeCommand(command: PlannerCommand | PlannerCommand[]): string {
  if (Array.isArray(command)) return `${command.length} atomic commands`;
  switch (command.type) {
    case "task.create":
      return `create task “${command.input.title}”`;
    case "task.update":
      return `update task ${command.taskId}`;
    case "journal.set":
      return `write journal ${command.date}`;
    default:
      return command.type;
  }
}

function commandName(command: PlannerCommand | PlannerCommand[]): string {
  return Array.isArray(command) ? "batch" : command.type;
}

function resultSummary(result: PlannerCommandResult, command: PlannerCommand | PlannerCommand[]) {
  if (!result.ok) return undefined;
  if (Array.isArray(command) && result.ok) {
    return { count: command.length };
  }
  return result.value;
}

async function mutate(
  args: ParsedArgs,
  command: PlannerCommand | PlannerCommand[],
): Promise<CliResponse> {
  const path = dataPath(args);
  const name = commandName(command);
  const key = flagString(args, "idempotency-key");
  const commandFingerprint = fingerprint(command);

  return withCliStoreLock(path, async (store) => {
    const expected = expectedRevision(args);
    if (expected !== undefined && expected !== store.revision) {
      throw new CliError(
        "STALE_REVISION",
        `Expected revision ${expected}, but the store is at ${store.revision}.`,
        { expected, actual: store.revision },
        3,
      );
    }

    if (key && store.idempotency[key]) {
      const previous = store.idempotency[key];
      if (previous.fingerprint !== commandFingerprint) {
        throw new CliError(
          "IDEMPOTENCY_CONFLICT",
          `Idempotency key ${key} was already used for a different command.`,
          undefined,
          3,
        );
      }
      return { ...(previous.response as CliResponse), replayed: true };
    }

    const context = {
      now: commandNow(args),
      deviceTag: flagString(args, "device-tag") ?? "cl",
      defaultConflictPolicy: conflictPolicy(args),
    } as const;
    const result = Array.isArray(command)
      ? executePlannerCommands(store.data, command, context)
      : executePlannerCommand(store.data, command, context);

    if (!result.ok) {
      return {
        ok: false,
        command: name,
        revision: store.revision,
        message: result.error.message,
        error: {
          code: result.error.code,
          message: result.error.message,
          details: result.error.conflictingTaskIds,
        },
      };
    }

    const validation = validatePlannerData(result.data);
    if (!validation.valid) {
      throw new CliError(
        "INVARIANT_VIOLATION",
        "Command produced invalid planner data; nothing was written.",
        validation.issues.filter((issue) => issue.severity === "error"),
        4,
      );
    }

    const dryRun = Boolean(args.flags["dry-run"]);
    const nextRevision = dryRun ? store.revision : store.revision + 1;
    const response: CliResponse = {
      ok: true,
      command: name,
      revision: nextRevision,
      message: dryRun ? "Dry run succeeded; no data was written." : "Command succeeded.",
      result: resultSummary(result, command),
      warnings: result.warnings,
      dryRun,
    };

    if (!dryRun) {
      const nextStore: CliStore = {
        ...store,
        revision: nextRevision,
        data: result.data,
        audit: [
          ...store.audit,
          {
            at: context.now.toISOString(),
            actor: actor(args),
            command: name,
            revision: nextRevision,
            summary: summarizeCommand(command),
            idempotencyKey: key,
          },
        ].slice(-5_000),
        idempotency: { ...store.idempotency },
      };
      if (key) {
        nextStore.idempotency[key] = { fingerprint: commandFingerprint, response };
        const keys = Object.keys(nextStore.idempotency);
        for (const oldKey of keys.slice(0, Math.max(0, keys.length - 2_000))) {
          delete nextStore.idempotency[oldKey];
        }
      }
      await writeCliStore(path, nextStore);
    }

    return response;
  });
}

function parsePriority(raw: string | undefined): TaskPriority | undefined {
  if (!raw) return undefined;
  if (!TASK_PRIORITIES.includes(raw as TaskPriority)) {
    throw new CliError("INVALID_PRIORITY", `Priority must be one of: ${TASK_PRIORITIES.join(", ")}.`);
  }
  return raw as TaskPriority;
}

function parseStatus(raw: string | undefined): TaskStatus | undefined {
  if (!raw) return undefined;
  if (!TASK_STATUSES.includes(raw as TaskStatus)) {
    throw new CliError("INVALID_STATUS", `Status must be one of: ${TASK_STATUSES.join(", ")}.`);
  }
  return raw as TaskStatus;
}

function taskCreateCommand(args: ParsedArgs, offset: number): PlannerCommand {
  const now = commandNow(args);
  const raw = flagString(args, "title") ?? args.positional.slice(offset).join(" ").trim();
  if (!raw) {
    throw new CliError("MISSING_TITLE", "Provide a task description or --title.");
  }
  const parsed = parseTaskLine(raw, { today: now });
  const scheduledDate = flagString(args, "date") ?? parsed.scheduledDate;
  const timeOfDay = flagString(args, "time") ?? parsed.timeOfDay;
  const allDay = Boolean(args.flags["all-day"]) || parsed.allDay;

  return {
    type: "task.create",
    input: {
      title: flagString(args, "title") ?? parsed.title,
      summary: flagString(args, "summary"),
      description: flagString(args, "description"),
      scheduledDate,
      timeOfDay: allDay ? undefined : timeOfDay,
      allDay: allDay || undefined,
      area: flagString(args, "area") ?? parsed.area,
      priority: parsePriority(flagString(args, "priority")) ?? parsed.priority,
      status: parseStatus(flagString(args, "status")) ?? (scheduledDate ? "scheduled" : "pool"),
    },
    conflictPolicy: conflictPolicy(args),
  };
}

function taskUpdateCommand(args: ParsedArgs, taskId: string): PlannerCommand {
  const patch: TaskPatch = {};
  const title = flagString(args, "title");
  const summary = flagString(args, "summary");
  const description = flagString(args, "description");
  const date = flagString(args, "date");
  const time = flagString(args, "time");
  const area = flagString(args, "area");
  const priority = parsePriority(flagString(args, "priority"));
  const status = parseStatus(flagString(args, "status"));
  if (title !== undefined) patch.title = title;
  if (summary !== undefined) patch.summary = summary;
  if (description !== undefined) patch.description = description;
  if (date !== undefined) patch.scheduledDate = date;
  if (time !== undefined) {
    patch.timeOfDay = time;
    patch.allDay = undefined;
  }
  if (args.flags["all-day"]) {
    patch.allDay = true;
    patch.timeOfDay = undefined;
  }
  if (area !== undefined) patch.area = area;
  if (priority !== undefined) patch.priority = priority;
  if (status !== undefined) patch.status = status;
  if (Object.keys(patch).length === 0) {
    throw new CliError("EMPTY_PATCH", "No task fields were supplied to update.");
  }
  return { type: "task.update", taskId, patch, conflictPolicy: conflictPolicy(args) };
}

async function readOnly(args: ParsedArgs): Promise<CliResponse> {
  const [scope = "status", action, ...rest] = args.positional;
  const store = await readCliStore(dataPath(args));
  const tasks = allTasks(store.data);

  if (scope === "status") {
    return {
      ok: true,
      command: "status",
      revision: store.revision,
      message: `${tasks.length} tasks, ${store.data.areas.length} areas, ${store.data.habits.length} habits.`,
      result: {
        tasks: tasks.length,
        areas: store.data.areas.length,
        habits: store.data.habits.length,
        journalDays: Object.values(store.data.daily).filter((entry) => entry.note.trim()).length,
        weeklyNotes: Object.values(store.data.weekly).filter((entry) => entry.notes.trim()).length,
        dataPath: dataPath(args),
      },
    };
  }

  if (scope === "validate") {
    const report = validatePlannerData(store.data);
    return {
      ok: report.valid,
      command: "validate",
      revision: store.revision,
      message: report.valid
        ? `Data is valid with ${report.warnings} warning${report.warnings === 1 ? "" : "s"}.`
        : `Data has ${report.errors} error${report.errors === 1 ? "" : "s"}.`,
      result: report,
      error: report.valid
        ? undefined
        : { code: "VALIDATION_FAILED", message: "Planner data failed validation." },
    };
  }

  if (scope === "inspect") {
    return {
      ok: true,
      command: "inspect",
      revision: store.revision,
      message: "Planner data loaded.",
      result: store.data,
    };
  }

  if (scope === "audit") {
    return {
      ok: true,
      command: "audit.list",
      revision: store.revision,
      message: `${store.audit.length} audit entries.`,
      result: store.audit.slice(-Number(flagString(args, "limit") ?? 50)).reverse(),
    };
  }

  if (scope === "task" && action === "list") {
    const date = flagString(args, "date");
    const status = parseStatus(flagString(args, "status"));
    const area = flagString(args, "area")?.toLowerCase();
    const selected = tasks.filter(
      (task) =>
        (!date || task.scheduledDate === date) &&
        (!status || task.status === status) &&
        (!area || task.area?.toLowerCase() === area),
    );
    return {
      ok: true,
      command: "task.list",
      revision: store.revision,
      message: `${selected.length} task${selected.length === 1 ? "" : "s"}.`,
      result: selected,
    };
  }

  if (scope === "task" && action === "show") {
    const task = tasks.find((entry) => entry.id === rest[0]);
    if (!task) throw new CliError("TASK_NOT_FOUND", `Task not found: ${rest[0] ?? ""}.`);
    return { ok: true, command: "task.show", revision: store.revision, message: task.title, result: task };
  }

  if (scope === "area" && action === "list") {
    return { ok: true, command: "area.list", revision: store.revision, message: `${store.data.areas.length} areas.`, result: store.data.areas };
  }

  if (scope === "habit" && action === "list") {
    return { ok: true, command: "habit.list", revision: store.revision, message: `${store.data.habits.length} habits.`, result: store.data.habits };
  }

  if (scope === "journal" && action === "show") {
    const date = rest[0] ?? requireValue(args, "date");
    return { ok: true, command: "journal.show", revision: store.revision, message: date, result: store.data.daily[date]?.note ?? "" };
  }

  if (scope === "week" && action === "show") {
    const weekStart = rest[0] ?? requireValue(args, "date");
    return { ok: true, command: "week.show", revision: store.revision, message: weekStart, result: store.data.weekly[weekStart]?.notes ?? "" };
  }

  throw new CliError("UNKNOWN_COMMAND", `Unknown command: ${args.positional.join(" ")}.`);
}

async function exportData(args: ParsedArgs): Promise<CliResponse> {
  const store = await readCliStore(dataPath(args));
  const out = resolve(process.cwd(), requireValue(args, "out"));
  await writeFile(out, `${JSON.stringify(store.data, null, 2)}\n`, "utf8");
  return { ok: true, command: "export", revision: store.revision, message: `Exported ${out}.`, result: { out } };
}

async function importData(args: ParsedArgs): Promise<CliResponse> {
  const source = requireValue(args, "file");
  const parsed = JSON.parse(await readFile(source, "utf8")) as unknown;
  const candidate =
    parsed && typeof parsed === "object" && "format" in parsed && "data" in parsed
      ? (parsed as { data: unknown }).data
      : parsed;
  const validated = validateImport(candidate);
  if (!validated) throw new CliError("INVALID_IMPORT", "File is not a supported Momentum backup.");
  const report = validatePlannerData(validated);
  if (!report.valid) throw new CliError("INVALID_IMPORT", "Imported data failed validation.", report.issues);

  return withCliStoreLock(dataPath(args), async (store) => {
    const nextRevision = store.revision + 1;
    await writeCliStore(dataPath(args), {
      ...store,
      revision: nextRevision,
      data: normalizePlannerData(validated),
      audit: [
        ...store.audit,
        {
          at: new Date().toISOString(),
          actor: actor(args),
          command: "import",
          revision: nextRevision,
          summary: `import ${source}`,
        },
      ].slice(-5_000),
    });
    return { ok: true, command: "import", revision: nextRevision, message: "Backup imported.", result: report };
  });
}

async function batchCommands(args: ParsedArgs): Promise<PlannerCommand[]> {
  const raw = args.flags.stdin
    ? await Bun.stdin.text()
    : await readFile(requireValue(args, "file"), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new CliError("INVALID_BATCH", "Batch input must be a JSON array.");
  return parsed as PlannerCommand[];
}

function mutationFromArgs(args: ParsedArgs): PlannerCommand | null {
  const [scope, action, ...rest] = args.positional;

  if (scope === "createtask") return taskCreateCommand(args, 1);
  if (scope === "task" && action === "create") return taskCreateCommand(args, 2);
  if (scope === "task" && action === "update") return taskUpdateCommand(args, rest[0] ?? "");
  if (scope === "task" && action === "delete") return { type: "task.delete", taskId: rest[0] ?? "" };
  if (scope === "task" && action === "complete") return { type: "task.update", taskId: rest[0] ?? "", patch: { status: "done" } };
  if (scope === "task" && action === "schedule") return { type: "task.schedule", taskId: rest[0] ?? "", date: requireValue(args, "date"), conflictPolicy: conflictPolicy(args) };
  if (scope === "task" && action === "pool") return { type: "task.returnToPool", taskId: rest[0] ?? "" };
  if (scope === "journal" && action === "set") return { type: "journal.set", date: requireValue(args, "date"), note: flagString(args, "note") ?? rest.join(" ") };
  if (scope === "week" && action === "set") return { type: "weekly.set", weekStart: requireValue(args, "date"), notes: flagString(args, "note") ?? rest.join(" ") };
  if (scope === "area" && action === "create") return { type: "area.create", name: rest.join(" ") || requireValue(args, "name"), color: flagString(args, "color") };
  if (scope === "area" && action === "rename") return { type: "area.update", areaId: rest[0] ?? "", patch: { name: requireValue(args, "name") } };
  if (scope === "area" && action === "archive") return { type: "area.update", areaId: rest[0] ?? "", patch: { archived: true } };
  if (scope === "area" && action === "restore-defaults") return { type: "area.restoreDefaults" };
  if (scope === "habit" && action === "create") return { type: "habit.create", name: rest.join(" ") || requireValue(args, "name"), color: flagString(args, "color"), createdDate: flagString(args, "date") };
  if (scope === "habit" && action === "toggle") return { type: "habit.toggle", habitId: rest[0] ?? "", date: requireValue(args, "date") };
  if (scope === "habit" && action === "archive") return { type: "habit.archive", habitId: rest[0] ?? "" };
  return null;
}

function printHuman(response: CliResponse): void {
  if (!response.ok) {
    console.error(`error [${response.error?.code ?? "UNKNOWN"}]: ${response.message}`);
    return;
  }
  console.log(response.message);
  if (response.command === "task.create" && response.result) {
    const task = response.result as DailyTask;
    console.log(`  ${task.id}  ${task.title}`);
  } else if (response.command === "task.list" && Array.isArray(response.result)) {
    for (const task of response.result as DailyTask[]) {
      console.log(`  ${task.id}  ${task.scheduledDate ?? "pool"}  ${task.timeOfDay ?? "any"}  ${task.title}`);
    }
  } else if (response.warnings && response.warnings.length > 0) {
    for (const warning of response.warnings as Array<{ message?: string }>) {
      console.log(`  warning: ${warning.message ?? JSON.stringify(warning)}`);
    }
  }
}

function printResponse(args: ParsedArgs, response: CliResponse): void {
  if (args.flags.json) console.log(JSON.stringify(response, null, 2));
  else printHuman(response);
  if (!response.ok) process.exitCode = 2;
}

const HELP = `Momentum CLI — command access to the shared application rules

  momentum createtask "Call mom tomorrow 6pm #personal"
  momentum task create "Deep work 9am-11am must #work"
  momentum task list [--date YYYY-MM-DD] [--status pool]
  momentum task update <id> [--title ...] [--date ...] [--time ...]
  momentum task complete|delete|pool <id>
  momentum task schedule <id> --date YYYY-MM-DD
  momentum journal set --date YYYY-MM-DD --note "..."
  momentum week set --date YYYY-MM-DD --note "..."
  momentum area create|list|rename|archive|restore-defaults
  momentum habit create|list|toggle|archive
  momentum status | validate | inspect | audit
  momentum batch --file commands.json | --stdin
  momentum export --out backup.json
  momentum import --file backup.json

Safety:
  --dry-run --expected-revision N --idempotency-key KEY
  --allow-conflict | --warn-conflict   (default: reject)
  --json --actor cli|llm|test

Storage:
  --data <path> or MOMENTUM_DATA_PATH. Otherwise uses the OS application-data folder.
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.help || args.positional.length === 0 || args.positional[0] === "help") {
    console.log(HELP);
    return;
  }

  let response: CliResponse;
  if (args.positional[0] === "batch") {
    response = await mutate(args, await batchCommands(args));
  } else if (args.positional[0] === "export") {
    response = await exportData(args);
  } else if (args.positional[0] === "import") {
    response = await importData(args);
  } else {
    const mutation = mutationFromArgs(args);
    response = mutation ? await mutate(args, mutation) : await readOnly(args);
  }
  printResponse(args, response);
}

main().catch((error) => {
  const known = error instanceof CliError;
  const response: CliResponse = {
    ok: false,
    command: process.argv.slice(2, 4).join(" ") || "unknown",
    message: error instanceof Error ? error.message : String(error),
    error: {
      code: known ? error.code : "UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : String(error),
      details: known ? error.details : undefined,
    },
  };
  const json = process.argv.includes("--json");
  if (json) console.error(JSON.stringify(response, null, 2));
  else console.error(`error [${response.error?.code}]: ${response.message}`);
  process.exitCode = known ? error.exitCode : 1;
});

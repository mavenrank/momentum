#!/usr/bin/env node
/**
 * momentum-data — moves Momentum's data between a browser export and a git
 * repository of plain JSON.
 *
 * Why this exists rather than the app writing the repo itself: Firefox and its
 * derivatives ship no local-disk picker, so a page running in Zen cannot be
 * handed a folder to write to. The browser's only reliable exits are a download
 * and a file input. This script owns everything on the far side of that line —
 * splitting an export into files git can diff, and reassembling them into
 * something the app can import.
 *
 * The data repository is always a *separate* private repo. Nothing here ever
 * writes planner data into the codebase.
 *
 *   node scripts/momentum-data.mjs import <export.json> --repo <path> [--commit]
 *   node scripts/momentum-data.mjs build --repo <path> [--out <file.json>]
 *   node scripts/momentum-data.mjs status --repo <path>
 *
 * Runs on plain Node 18+ with no dependencies. `bun` works too.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const SCHEMA_VERSION = 4;

/* ------------------------------------------------------------------ util -- */

const styles = { dim: "[2m", red: "[31m", green: "[32m", reset: "[0m" };
const paint = (style, text) => `${styles[style]}${text}${styles.reset}`;

function fail(message) {
  console.error(paint("red", `error: ${message}`));
  process.exit(1);
}

/** Stable stringify so a file's diff only ever shows real changes. */
function serialise(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`could not read ${path}: ${error.message}`);
  }
}

/** Writes only when the content actually differs, keeping git history quiet. */
async function writeIfChanged(path, content) {
  if (existsSync(path) && (await readFile(path, "utf8")) === content) {
    return false;
  }
  await writeFile(path, content, "utf8");
  return true;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    // Boolean flags have no value following them.
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }

  return { positional, flags };
}

/* ------------------------------------------------------------------ paths -- */

const layout = (repo) => ({
  root: repo,
  months: join(repo, "months"),
  meta: join(repo, "meta.json"),
  areas: join(repo, "areas.json"),
  domains: join(repo, "domains.json"),
  pursuits: join(repo, "pursuits.json"),
  habits: join(repo, "habits.json"),
  habitLogs: join(repo, "habit-logs.json"),
  weeks: join(repo, "weeks.json"),
});

function monthOf(dateKey) {
  return (dateKey ?? "").slice(0, 7) || "unknown";
}

/* ----------------------------------------------------------------- import -- */

/**
 * Splits an export into files.
 *
 * The split is by month of *creation*, not of scheduling. A task's creation
 * date never changes, so once a month is past its file stops changing forever —
 * which is what makes this cheap to sync and readable in git log. Splitting by
 * scheduled date would rewrite old files every time you rescheduled something.
 */
async function commandImport(exportPath, repo, options) {
  const data = await readJson(exportPath);
  if (typeof data !== "object" || !data.daily) {
    fail(`${basename(exportPath)} does not look like a Momentum export`);
  }

  const paths = layout(repo);
  await mkdir(paths.months, { recursive: true });

  // Group tasks and day notes into monthly buckets.
  const months = new Map();
  const bucket = (month) => {
    let entry = months.get(month);
    if (!entry) {
      entry = { tasks: [], notes: {} };
      months.set(month, entry);
    }
    return entry;
  };

  let taskCount = 0;
  for (const [date, entry] of Object.entries(data.daily ?? {})) {
    for (const task of entry.tasks ?? []) {
      const homeDate = (task.createdAt ?? "").slice(0, 10) || date;
      bucket(monthOf(homeDate)).tasks.push(task);
      taskCount += 1;
    }
    if (entry.note || (entry.taskReferences ?? []).length > 0) {
      bucket(monthOf(date)).notes[date] = {
        note: entry.note ?? "",
        taskReferences: entry.taskReferences ?? [],
      };
    }
  }

  const written = [];
  for (const [month, entry] of [...months].sort(([a], [b]) => a.localeCompare(b))) {
    entry.tasks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const file = join(paths.months, `${month}.json`);
    if (await writeIfChanged(file, serialise(entry))) {
      written.push(`months/${month}.json`);
    }
  }

  const singles = [
    [paths.areas, data.areas ?? []],
    [paths.domains, data.domains ?? []],
    [paths.pursuits, data.pursuits ?? []],
    [paths.habits, data.habits ?? []],
    [paths.habitLogs, data.habitLogs ?? []],
    [paths.weeks, data.weekly ?? {}],
    [
      paths.meta,
      {
        version: data.version ?? SCHEMA_VERSION,
        nextTaskId: data.nextTaskId ?? 1,
        updatedAt: data.updatedAt ?? new Date().toISOString(),
      },
    ],
  ];

  for (const [file, value] of singles) {
    if (await writeIfChanged(file, serialise(value))) {
      written.push(basename(file));
    }
  }

  await writeIfChanged(join(repo, "README.md"), repoReadme());

  console.log(
    `imported ${taskCount} task${taskCount === 1 ? "" : "s"} across ${months.size} month${
      months.size === 1 ? "" : "s"
    }`,
  );
  if (written.length === 0) {
    console.log(paint("dim", "nothing changed"));
  } else {
    for (const name of written) {
      console.log(paint("green", `  ~ ${name}`));
    }
  }

  if (options.commit) {
    commit(repo, `data: import ${taskCount} tasks`);
  }
}

/* ------------------------------------------------------------------ build -- */

/** Reassembles the repo into a single file the app's Import JSON will accept. */
async function commandBuild(repo, outPath) {
  const paths = layout(repo);
  if (!existsSync(paths.meta)) {
    fail(`${repo} does not look like a momentum-data repo (no meta.json)`);
  }

  const meta = await readJson(paths.meta);
  const daily = {};
  const ensure = (date) => (daily[date] ??= { date, tasks: [], note: "", taskReferences: [] });

  let taskCount = 0;
  const monthFiles = existsSync(paths.months)
    ? (await readdir(paths.months)).filter((name) => name.endsWith(".json")).sort()
    : [];

  for (const name of monthFiles) {
    const month = await readJson(join(paths.months, name));

    for (const task of month.tasks ?? []) {
      // Tasks are filed under their creation date, which is how the app keys
      // its daily map — the scheduled date is a property, not a location.
      ensure((task.createdAt ?? "").slice(0, 10)).tasks.push(task);
      taskCount += 1;
    }
    for (const [date, note] of Object.entries(month.notes ?? {})) {
      const entry = ensure(date);
      entry.note = note.note ?? "";
      entry.taskReferences = note.taskReferences ?? [];
    }
  }

  const bundle = {
    version: meta.version ?? SCHEMA_VERSION,
    daily,
    weekly: existsSync(paths.weeks) ? await readJson(paths.weeks) : {},
    habits: existsSync(paths.habits) ? await readJson(paths.habits) : [],
    habitLogs: existsSync(paths.habitLogs) ? await readJson(paths.habitLogs) : [],
    areas: existsSync(paths.areas) ? await readJson(paths.areas) : [],
    domains: existsSync(paths.domains) ? await readJson(paths.domains) : [],
    pursuits: existsSync(paths.pursuits) ? await readJson(paths.pursuits) : [],
    nextTaskId: meta.nextTaskId ?? 1,
    updatedAt: meta.updatedAt ?? new Date().toISOString(),
  };

  const out = outPath ?? `momentum-import-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(out, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  console.log(`wrote ${out}`);
  console.log(
    paint("dim", `  ${taskCount} tasks · ${Object.keys(daily).length} days · import this in the Data view`),
  );
}

/* ----------------------------------------------------------------- status -- */

async function commandStatus(repo) {
  const paths = layout(repo);
  if (!existsSync(paths.meta)) {
    fail(`${repo} does not look like a momentum-data repo (no meta.json)`);
  }

  const meta = await readJson(paths.meta);
  const monthFiles = existsSync(paths.months)
    ? (await readdir(paths.months)).filter((name) => name.endsWith(".json")).sort()
    : [];

  let total = 0;
  const rows = [];
  for (const name of monthFiles) {
    const month = await readJson(join(paths.months, name));
    const count = (month.tasks ?? []).length;
    total += count;
    rows.push([name.replace(".json", ""), count, Object.keys(month.notes ?? {}).length]);
  }

  console.log(`momentum-data at ${repo}`);
  console.log(paint("dim", `  schema v${meta.version} · next id ${meta.nextTaskId} · updated ${meta.updatedAt}`));
  console.log("");
  for (const [month, tasks, notes] of rows) {
    console.log(`  ${month}  ${String(tasks).padStart(4)} tasks  ${String(notes).padStart(3)} notes`);
  }
  console.log("");
  console.log(`  ${total} tasks total across ${rows.length} months`);
}

/* -------------------------------------------------------------------- git -- */

function commit(repo, message) {
  try {
    execFileSync("git", ["-C", repo, "add", "-A"], { stdio: "pipe" });
    const staged = execFileSync("git", ["-C", repo, "diff", "--cached", "--name-only"], {
      encoding: "utf8",
    }).trim();

    if (!staged) {
      console.log(paint("dim", "nothing to commit"));
      return;
    }

    execFileSync("git", ["-C", repo, "commit", "-m", message], { stdio: "pipe" });
    console.log(paint("green", `committed: ${message}`));
  } catch (error) {
    console.error(paint("red", `git failed: ${error.message.split("\n")[0]}`));
  }
}

/* ----------------------------------------------------------------- readme -- */

function repoReadme() {
  return `# momentum-data

Planner data for [Momentum](https://github.com/), kept as plain JSON so git can
version it. **This repository holds personal data — keep it private.** It is
deliberately separate from the application's source repository; nothing here is
code, and no code lives here.

## Layout

| Path | Contents |
| --- | --- |
| \`meta.json\` | Schema version, the task-ID counter, last update time |
| \`domains.json\` | Broad Domains and their colours |
| \`areas.json\` | Areas and their Domain |
| \`habits.json\` | Habit definitions |
| \`habit-logs.json\` | Daily habit ticks |
| \`weeks.json\` | Weekly notes, keyed by week start |
| \`months/YYYY-MM.json\` | Every task *created* that month, plus that month's day notes |

Tasks are filed by the month they were **created**, not the month they are
scheduled for. A creation date never changes, so a past month's file stops
changing for good — which keeps diffs small and history meaningful. Rescheduling
a task edits it in place in the file it has always lived in.

## Workflow

Export from Momentum's Data view, then:

\`\`\`sh
node scripts/momentum-data.mjs import ~/Downloads/momentum-2026-08-04.json --repo . --commit
\`\`\`

To load it back into a browser — a new machine, a different profile:

\`\`\`sh
node scripts/momentum-data.mjs build --repo . --out restore.json
\`\`\`

then use **Import JSON** in the Data view.

\`\`\`sh
node scripts/momentum-data.mjs status --repo .
\`\`\`

shows what the repo currently holds.

## Conflicts

Two machines importing to the same repo will conflict in git rather than
silently clobbering each other — which is the point. Monthly files keep those
conflicts contained to the month you were actually working in.
`;
}

/* ------------------------------------------------------------------- main -- */

const HELP = `momentum-data — Momentum's data as a git repository of JSON

  import <export.json> --repo <path> [--commit]   split an export into the repo
  build --repo <path> [--out <file.json>]         reassemble into one importable file
  status --repo <path>                            summarise what the repo holds

The repo path must be a private repository separate from the codebase.
`;

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;

  if (!command || flags.help || command === "help") {
    console.log(HELP);
    return;
  }

  const repo = typeof flags.repo === "string" ? flags.repo : null;
  if (!repo) {
    fail("--repo <path> is required");
  }
  if (!existsSync(repo)) {
    fail(`${repo} does not exist`);
  }

  switch (command) {
    case "import": {
      const source = rest[0];
      if (!source) {
        fail("import needs the path to an exported JSON file");
      }
      if (!existsSync(source)) {
        fail(`${source} does not exist`);
      }
      await commandImport(source, repo, { commit: Boolean(flags.commit) });
      break;
    }
    case "build":
      await commandBuild(repo, typeof flags.out === "string" ? flags.out : null);
      break;
    case "status":
      await commandStatus(repo);
      break;
    default:
      fail(`unknown command "${command}"\n\n${HELP}`);
  }
}

main().catch((error) => fail(error.stack ?? String(error)));

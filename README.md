# Momentum

Momentum is a lightweight planning app for personal accountability.

It is a solo planner with local-first data, portable JSON backups, natural-language
task capture, a continuous calendar, and dynamic habits. Journal entries and
their task references remain in the data model, but the journal view is currently
hidden. Future phases can add friend/accountability views without
changing the core app shape.

## Stack

- Bun package manager
- React 19 + TypeScript
- Vite
- Tailwind CSS v4 + shadcn/ui (source-owned components in `src/components/ui`)
- Dexie (IndexedDB) for persistence
- dnd-kit for week planning drag-and-drop

## Commands

```bash
bun install
bun run dev
bun run build
bun test
bun run check
bun run check:full
bun tauri dev
```

`bun run check` runs the typecheck, lint and tests together.
`bun run check:full` also runs the Python application, concurrency, and
year-scale load suite. `bun tauri dev` opens the same frontend in the native
Tauri shell using its filesystem repository.

## CLI

The CLI uses the same command validation and conflict rules as the web app. Its
file-backed store is intentionally separate from browser IndexedDB; export a
portable backup when you want to load generated or terminal-managed data into
the web app.

```powershell
bun run momentum -- createtask "Call mom tomorrow 6pm #personal"
bun run momentum -- task list --date 2026-08-26
bun run momentum -- pursuit create "Dissertation" --area "Work / General"
bun run momentum -- pursuit list --json
bun run momentum -- validate
```

Pass `--json` for scripts and LLM tools. Mutations support `--dry-run`,
`--expected-revision`, and `--idempotency-key`; scheduling conflicts are rejected
unless `--warn-conflict` or `--allow-conflict` is explicit. See
`bun run momentum -- help` and `scripts/README.md`.

## Sections

- **Planner** — two execution lenses over the same tasks:
  - *Today*: a three-day board. While yesterday still has unfinished work the
    board looks back (Yesterday / Today / Tomorrow); once it is clear the board
    rolls forward (Today / Tomorrow / Day after). The Pool sits alongside as a
    rail that widens when it is busy and collapses to a tab when it is not.
  - *Week*: unscheduled and pool panels above a seven-day strip. Assign a day by
    dragging, or select a task and press `Ctrl+Shift+1`–`7`.
- **All tasks** — a full-width table for every date and status. Sort its columns,
  search by title or ID, and narrow results by Domain, Area, Pursuit, and date.
  Selecting a row opens its task page.
- **Calendar** — a continuously scrolling month grid. Every date appears exactly
  once, rows resize so the active month fills the viewport, and the scroll settles
  onto month boundaries. The month and year float over the grid and roll in the
  direction of travel.
- **Habits** — weekly matrix with add and archive.
- **Pursuits** — browse Domains, Areas, and Pursuits in one view. An Area can hold
  direct tasks and multiple Pursuits. A Pursuit has one home Area and can also
  participate in other Areas. Pursuits can be held, completed, or archived.
- **Settings** — a collapsible sidebar for the organization guide, Domain, Area,
  and Pursuit management, customization, and Data. Data contains v4 JSON
  export/import (v1–v3 backups migrate on import) and Logseq export, one page
  per task.

## Quick Add

A single input parses one or more lines into structured tasks, highlighting the
tokens it recognises as you type and previewing the resulting fields underneath.

```
Buy groceries tomorrow 3pm must #health
```

- **Areas** — `#health`; `#` opens a fuzzy list, Tab completes, an unknown tag
  creates the area.
- **Priority** — `must`, `should`, `could`, `want`.
- **Dates** — relative (`today`, `tomorrow`, `in 3 days`, `next monday`) and
  absolute (`July 14`, `14 Jul`, `3-8-26`, `03.08.2026`, `14/7`, `2026-07-14`,
  `03082026`). Numeric dates read day-first.
- **Times** — `3pm`, `9:30am`, `15:00`, `2-4pm`, `9am-5pm`.

A task with no date goes to the Pool. Paste a list to create tasks in bulk.

Domains describe broad parts of life, such as Work and Personal. Areas describe
ongoing responsibilities within a Domain. Pursuits group specific efforts over
time. Tasks can be left unclassified or assigned at any one of these levels;
their primary Area and optional related Areas retain stable IDs through renames.
Each Pursuit has one home Area, and can participate in additional Areas when
the same effort genuinely spans them. Area and Domain names can repeat in
different parents. Use the qualified `Domain / Area` path or an ID in the CLI
when a name is ambiguous. Archiving keeps history; merging moves references and
archives the source. See `scripts/README.md` for equivalent CLI operations.

## Task model

Tasks carry an immutable `T-YYYYMMDD-NNNN` id, a title, an optional one-line
`summary` shown on the card, and an optional long-form `description` for the few
tasks that need real notes. Relationships (`dependsOn`, `blocks`, `related`,
`followUpOf`) form a graph rather than a tree.

Task pages show scheduling, related and nearby tasks, and follow-ups in one
place. Follow-ups can be created and edited there; the CLI can perform the same
operations against its separate store.

Anything left unfinished from the day before yesterday or earlier is swept back
into the Pool automatically; yesterday is left alone so it can be triaged in the
board.

## Storage

All app data lives in IndexedDB via Dexie, written on a trailing 400ms debounce
and synchronised across tabs with `BroadcastChannel`. A v1 `localStorage` payload
is migrated on first launch and then removed. `localStorage` retains only the
theme preference.

## Versioning

The current version is stored in `VERSION.txt`. Changes are tracked in
`CHANGELOG.txt` using Semantic Versioning.

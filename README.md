# Momentum

Momentum is a lightweight planning and journaling app for personal accountability.

It is a solo planner with local-first data, portable JSON backups, natural-language
task capture, a continuous calendar, dynamic habits, and a journal that can
reference tasks by ID. Future phases can add friend/accountability views without
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
```

`bun run check` runs the typecheck, lint and tests together.

## Sections

- **Planner** — two execution lenses over the same tasks:
  - *Today*: a three-day board. While yesterday still has unfinished work the
    board looks back (Yesterday / Today / Tomorrow); once it is clear the board
    rolls forward (Today / Tomorrow / Day after). The Pool sits alongside as a
    rail that widens when it is busy and collapses to a tab when it is not.
  - *Week*: unscheduled and pool panels above a seven-day strip. Assign a day by
    dragging, or select a task and press `Ctrl+Shift+1`–`7`.
- **Calendar** — a continuously scrolling month grid. Every date appears exactly
  once, rows resize so the active month fills the viewport, and the scroll settles
  onto month boundaries. The month and year float over the grid and roll in the
  direction of travel.
- **Habits** — weekly matrix with add and archive.
- **Journal** — daily entries; typing `@` opens a fuzzy task search and inserts a
  reference that is tracked in `taskReferences`.
- **Data** — v2 JSON export/import (v1 backups migrate on import) and a Logseq
  markdown export, one page per task.
- **Settings** — manage areas: add, rename, recolour, archive, restore defaults.

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

## Task model

Tasks carry an immutable `T-YYYYMMDD-NNNN` id, a title, an optional one-line
`summary` shown on the card, and an optional long-form `description` for the few
tasks that need real notes. Relationships (`dependsOn`, `blocks`, `related`,
`followUpOf`) form a graph rather than a tree.

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

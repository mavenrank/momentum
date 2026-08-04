# scripts

Tooling that lives alongside the app but operates on things outside it.

## `momentum-data.mjs`

Moves planner data between a browser export and a **separate private git
repository** of plain JSON.

> Planner data must never be committed to this repository. Every command takes
> `--repo <path>` pointing at the private data repo, and nothing is written
> inside the codebase.

### Why a script rather than the app doing it

The app runs in a browser, and browsers cannot be handed a folder to write to
unless they ship the File System Access API. Chromium does; **Firefox and its
derivatives — Zen, LibreWolf, Floorp — do not**, and support only origin-private
storage the user can neither see nor back up. In those browsers the only
reliable ways data can cross the boundary are a download and a file input.

So the split is drawn there: the browser produces and consumes one JSON file,
and this script owns everything on the far side — splitting it into files git
can diff, and reassembling them on the way back.

### Commands

```sh
# Split an export into the data repo, optionally committing the result.
node scripts/momentum-data.mjs import ~/Downloads/momentum-2026-08-04.json --repo ../momentum-data --commit

# Reassemble the repo into one file to feed back into Data → Import JSON.
node scripts/momentum-data.mjs build --repo ../momentum-data --out restore.json

# Summarise what the repo holds.
node scripts/momentum-data.mjs status --repo ../momentum-data
```

No dependencies; plain Node 18+ or `bun`.

### Repository layout it produces

```
momentum-data/
  README.md            generated, explains the layout to anyone who opens the repo
  meta.json            schema version, task-ID counter, last update
  areas.json
  habits.json
  habit-logs.json
  weeks.json           weekly notes keyed by week start
  months/
    2026-07.json       tasks *created* in July, plus July's day notes
    2026-08.json
```

### Why monthly, and why by creation date

Splitting by month keeps each file small enough to read and diff. Splitting by
**creation** date rather than scheduled date is the part that matters: a task's
creation date never changes, so once a month has passed its file stops changing
for good. Rescheduling a task edits it in place in the file it has always lived
in, rather than moving it between files and dirtying two months at once.

The practical effect is that `git log` becomes a genuine history — a commit
touching `months/2026-03.json` means you really did go back and change something
from March.

### Round-trip guarantee

`build` reverses `import` exactly: the reassembled bundle is identical to the
original export once key ordering is normalised. `import` is also idempotent —
running it twice with the same export writes nothing the second time, so it is
safe to wire into a habit or a scheduled task.

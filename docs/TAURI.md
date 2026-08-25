# The Tauri shell

**Status: accepted and merged into `main` on 2026-08-25.** The work began as an
isolated `experiment/tauri-shell` worktree on 2026-08-04. The browser build
remains supported and uses the same frontend and domain layer; Tauri is a second
distribution target for durable filesystem storage, not a migration away from
the web application.

## Why this exists

Momentum stores data in IndexedDB, which is scoped to origin, browser and
profile. Chrome and Zen see different datasets. Two profiles see different
datasets. `localhost:5178` and a deployed URL see different datasets. The
browser may evict the store under disk pressure, and "clear site data" destroys
it outright.

The binding constraint is Zen. It is a Firefox derivative, and Firefox ships no
local-disk picker — no `showDirectoryPicker`, no `showSaveFilePicker` — so the
page cannot be handed a folder to back itself up into. That is not a gap waiting
to be filled; it is a deliberate position Mozilla has held for years.

Inside a Tauri window all of it dissolves: a real path, no origin scoping, no
eviction, no permission prompts, no picker API.

### What it does not buy

Tauri uses the OS webview — WebView2 on Windows — so it beats Electron
comfortably on binary size and memory. But the comparison that matters here is
not against Electron, it is against *a tab in a browser that is already open*.
Measured that way the shell is additional memory, not less: a second WebView2
process tree that would not otherwise exist. The win is storage and
distribution. It is not a resource win, and this document will not pretend
otherwise.

## Running it

```
bun install          # install JavaScript and Tauri CLI dependencies
bun tauri dev        # native window, filesystem store
bun dev              # browser, IndexedDB, exactly as before
```

`bun tauri dev` starts Vite on port 5173 and points the window at it. The port
is pinned with `strictPort` — a silent fallback to 5174 would leave the window
staring at nothing.

A release build:

```
bun tauri build
```

Output lands in `src-tauri/target/release/`, with an NSIS installer under
`bundle/nsis/`. MSI is disabled: it needs WiX downloaded on first use and adds
nothing here.

## Where the data lives

By default:

```
%APPDATA%\org.mavenrank.momentum\data\
```

The identifier is the reverse-DNS form a bundle identifier is meant to take,
which is why the folder is not the barer `%APPDATA%\momentum` the original
prompt sketched.

Two things sit beside each other and should not be confused:

| Path | What it is |
| --- | --- |
| `%APPDATA%\org.mavenrank.momentum\settings.json` | This installation's settings: the data folder, and the device tag |
| `<data folder>` | The planner store itself |

The device tag deliberately does **not** live in the data folder. It is what
keeps task IDs unique across machines, so if it travelled with the data, two
machines syncing one folder would adopt the same tag and start minting colliding
IDs — exactly what the tag exists to prevent.

### Changing the folder

Data view → **Data folder** → **Change folder**. Pointing this at something
Drive, Syncthing or a NAS mount already watches is the entire argument for the
shell over a browser tab.

Choosing a folder that already holds a store adopts that store, and its contents
win. Choosing an empty folder seeds it with whatever is loaded. Either way the
app reloads against the new location.

The static Tauri capability can only grant the app-data directory at build time,
so a folder chosen later is granted at runtime through one small Rust command,
`allow_data_dir` in `src-tauri/src/lib.rs`.

## The storage format

A folder of plain JSON, split by the month each task was *created* in — the same
layout `scripts/momentum-data.mjs` already reads and writes:

```
meta.json            schema version, task-ID counter, last update time
areas.json           areas and their colours
habits.json          habit definitions
habit-logs.json      daily habit ticks
weeks.json           weekly notes, keyed by week start
months/YYYY-MM.json  tasks created that month, plus that month's day notes
```

**JSON over SQLite**, for three reasons. The CLI keeps working on the folder
untouched, so `momentum-data status`, `build` and the git data repo all still
apply. The folder stays diffable, which is what makes syncing it through git a
real option rather than a binary blob shuffle. And a store you can open in a
text editor when something looks wrong is worth a great deal in a personal tool
that has no support channel.

The cost is rewriting whole month files rather than single rows. That is bounded
by the split being on *creation* date: a past month's file stops changing once
the month is over, so a save touches only what you have created recently, not
everything you own. SQLite becomes the right answer if the dataset ever outgrows
that, and the `Repository` seam means swapping it is a contained change.

Serialisation is byte-identical to the CLI's: keys sorted, two-space indent,
trailing newline. If the two disagreed on formatting, running the CLI over a
folder the app wrote would rewrite every file and vice versa, and the clean git
history this layout exists to produce would be noise.

### The diffing contract

`projectToFiles` renders the whole store to `path → content`, and `diffFiles`
compares that against what was last written. Only files that actually differ are
written; month files with nothing left in them are deleted. Without this every
save would rewrite every month, and a synced folder would be in permanent churn.

Writes go to `<file>.tmp` and are then renamed over the target. On NTFS that
replacement is a single step, so a reader sees either the whole old file or the
whole new one. Killing the app mid-save cannot leave a truncated store — at
worst it leaves a stray `.tmp`, which the loader ignores because it only reads
`.json`.

### `subscribe` is a no-op

In the browser this carries writes between tabs over a `BroadcastChannel`. There
are no tabs in the shell: one window, one writer, one process.

A file watcher was considered and deliberately not built. Its only real use
would be noticing a sync client dropping a newer file underneath a running app —
and reloading state from that without a merge strategy would silently discard
whatever the user had just typed. Last-write-wins across machines is the honest
behaviour until real sync exists, and real sync is explicitly out of scope.

## How the backend gets chosen

`src/lib/persistence/repository.ts` ends with:

```ts
export const repository: Repository = isTauriShell()
  ? createTauriRepository()
  : createRepository();
```

Nothing above that line knows which backend it got. That was the point of
putting the `Repository` interface there: the Dexie implementation already
stored tasks as rows, diffed before writing, wrote tombstones and stamped
`updatedAt`, so a second backend could be added without the app changing. It
was, and the app did not.

## Getting back out

The browser build never stopped working — `bun dev` gives the app on IndexedDB,
while `bun tauri dev` opens the filesystem-backed native shell.

To move data from the shell into a browser: Data view → **Export JSON**, then
**Import JSON** in the browser build. Or run the CLI against the shell's folder:

```
node scripts/momentum-data.mjs build --repo "%APPDATA%\org.mavenrank.momentum\data" --out restore.json
```

The original experiment remains visible in git history as five focused commits
followed by a non-fast-forward acceptance merge. Its reconstructed commit dates
come from the branch reflog and file timestamps recorded on 2026-08-04.

## Verdict

Measured on Windows 11 (build 26200), release build, WebView2 150.0.4078.105.

| | Tauri shell | Momentum in a Zen tab |
| --- | --- | --- |
| Installer | 2.22 MB | — |
| Installed binary | 4.43 MB | — |
| Time to window | 80 ms cold, ~60 ms warm | — |
| Idle memory | 394 MB across 7 processes | _pending_ |

Read those numbers carefully, because two of them flatter the shell.

**Time to window is not time to usable.** The measurement is the moment a window
handle exists, and tao creates the native window before the webview has
navigated, let alone painted. Sub-100 ms is real but it is measuring the frame,
not the app inside it. Call it about a second to a drawn planner.

**Idle memory sums working sets,** which counts pages shared between the
WebView2 processes more than once. The true figure is lower. It is quoted this
way because the browser comparison has the same bias, so the two are at least
wrong in the same direction.

### The honest reading

The size story is genuinely good: a 2.2 MB installer, because WebView2 is
already on the machine and is not shipped. Against Electron this is not close.

The memory story is not a win and should not be sold as one. Zen is open anyway
— for mail, for the web, for everything else — so a tab in it costs only its
marginal renderer. The shell costs a whole process tree that would not otherwise
exist. Running Momentum in the shell uses *more* of this machine's memory than
running it in a tab, not less.

So the case rests entirely on storage, and there it is decisive:

- The store is a path. Not an origin, not a profile, not a browser. Moving
  browsers, adding a profile or deploying to a URL no longer forks the dataset.
- Nothing evicts it. No quota, no "clear site data" foot-gun.
- It is a folder of JSON that `momentum-data.mjs` reads directly, and that git
  can diff, and that a sync client can carry off the machine — which in Zen was
  simply not possible, because Firefox ships no directory picker and is not
  going to.

That last point is the one that matters. The browser build's answer to "what if
this machine dies" is a manual download the user has to remember. The shell's
answer is a folder that Syncthing or Drive already watches.

**Recommendation: keep**, as a second way to run the same app rather than a
replacement. The browser build stays — it costs nothing to keep, it is the
lighter option when the machine is under pressure, and it is the escape hatch if
Tauri ever becomes a maintenance burden. What the shell buys is durable local
storage on the one browser that cannot offer it, and that is worth 400 MB of
resident memory on a machine that has plenty.

Reconsider if: the dataset grows to where rewriting month files is felt (switch
to SQLite behind the same `Repository` seam), or real multi-device sync arrives
and makes last-write-wins untenable.

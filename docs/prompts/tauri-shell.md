# Prompt — wrap Momentum in a Tauri shell (experiment)

Hand this to a fresh agent session. It is self-contained: everything needed to
judge the trade-offs is stated below, including the reasons this is worth trying
and the reasons it might not be.

**Treat this as an experiment on a branch, not a migration.** The browser build
must keep working unchanged throughout.

---

## Why

Momentum is a Vite + React 19 + TypeScript planner that stores data in IndexedDB
via Dexie. That store is scoped to **origin + browser + profile**, which means:

- Chrome and Zen see different datasets. Two profiles see different datasets.
- `localhost:5178` and any deployed URL are different origins, so different data.
- The browser may evict it under disk pressure, and "clear site data" destroys it.
- The user runs **Zen**, a Firefox derivative. Firefox ships no local-disk picker
  — no `showDirectoryPicker`, no `showSaveFilePicker` — so the app cannot be
  granted a folder to back itself up into. This is the binding constraint, and it
  is not going away.

A Tauri shell dissolves all of it: a real filesystem path, no origin scoping, no
eviction, no permission prompts, no picker API.

### What it does *not* buy

Be honest about this in the final report. Tauri uses the OS webview (WebView2 on
Windows), so it comfortably beats Electron on binary size and memory — but
against "a tab in the browser I already have open" it is *additional* memory, not
less. Do not sell this as a resource win. The win is storage and distribution.

## Constraints

- Windows is the primary target. Keep it cross-platform where free, but do not
  spend effort on macOS/Linux packaging.
- **The browser build must keep working.** Anyone should still be able to run
  `bun dev` and get the app in a browser with IndexedDB, unchanged.
- No always-on background service. The user explicitly does not want a daemon or
  a server they have to remember to start. The app is the process; it lives and
  dies with the window.
- Do not add planner data to the repository.

## The seam you plug into

`src/lib/persistence/repository.ts` exports this interface, and the app touches
storage through nothing else:

```ts
export interface Repository {
  load: () => Promise<PlannerData>;
  save: (data: PlannerData) => Promise<void>;
  subscribe: (listener: (data: PlannerData) => void) => () => void;
  onQuotaError: (handler: QuotaErrorHandler) => () => void;
}
```

The existing Dexie implementation already:

- stores **tasks as their own records**, keyed by id, not nested inside days;
- **diffs before writing**, so only changed rows are touched;
- writes **tombstones** (`deletedAt`) instead of removing rows;
- stamps **`updatedAt`** on every record it changes;
- mints **collision-free task IDs** with a per-installation device tag.

That work was done specifically so a second backend could be added without
touching the app. Your job is to add one, not to change the shape of the data.

## Task

1. Add Tauri v2 to the project on a branch. Keep the Rust crate under
   `src-tauri/`. Wire `bun dev` / `bun build` so the web build is unchanged and
   `bun tauri dev` runs the shell.

2. Implement a `Repository` backed by the filesystem, selected at runtime by
   detecting the Tauri environment. Suggested location:
   `src/lib/persistence/tauriRepository.ts`, chosen inside
   `createRepository()` or a small factory beside it.

   Store under the OS app-data directory (`$APPDATA/momentum` on Windows) — but
   make the location **configurable and visible in the Data view**, because a
   user pointing it at a synced folder is the whole point.

3. Pick a storage format and justify it in the report:
   - **A folder of JSON** matching `scripts/momentum-data.mjs`'s layout
     (`months/YYYY-MM.json`, `areas.json`, …). Cheapest, git-friendly, and the
     existing scripts work on it directly. Recommended starting point.
   - **SQLite** via `tauri-plugin-sql`. Better if the dataset ever grows past
     what is comfortable to rewrite, worse for git and for hand-inspection.

   Do not do both. If you pick JSON, per-file writes must still respect the
   diffing contract — do not rewrite every month on every save.

4. `subscribe` currently carries cross-tab updates via `BroadcastChannel`. In the
   shell there are no tabs; either make it a no-op or back it with a file watcher
   if you chose the JSON layout. Say which, and why.

5. Verify:
   - `bun run check` passes (tsc + eslint + tests).
   - Data written by the shell can be read by `scripts/momentum-data.mjs status`.
   - The browser build still starts and still uses IndexedDB.
   - Killing the app mid-write does not corrupt the store — write to a temp file
     and rename, do not write in place.

## Deliverables

- The branch, building and running.
- A short `docs/TAURI.md`: how to run it, where data lives, how to change that,
  and how to get back out to the browser build.
- A written recommendation: **keep or discard**. Include the actual installed
  size, cold-start time, and idle memory next to a browser tab running the same
  app. If the answer is "not worth it", say so plainly — the experiment
  succeeding at answering the question is the point, not the shell shipping.

## Explicitly out of scope

- Multi-device sync. Not now.
- Auto-update, code signing, installers beyond whatever `tauri build` gives.
- Mobile.
- Replacing the browser build. It stays.

# Prompt — provision the private `momentum-data` repository

Hand this to an agent session (or follow it yourself). It sets up the private
git repository that holds planner data, separate from the Momentum codebase.

---

## Context

Momentum stores planner data in the browser's IndexedDB. That store is scoped to
one origin in one browser profile on one machine, and it dies with "clear site
data". The durable copy lives in a **separate private git repository** of plain
JSON, driven by `scripts/momentum-data.mjs` in the codebase repo.

The browser cannot write to that repo directly. This project is used in Zen (a
Firefox derivative), and Firefox ships no local-disk picker — no
`showDirectoryPicker`, no `showSaveFilePicker`. Data crosses the boundary as a
download on the way out and a file input on the way in. The script does the rest.

## Hard constraints

- **No planner data in the codebase repository, ever.** Not in `docs/`, not in
  fixtures, not in a test. The data repo is a different repository.
- The data repo is **private**. It contains a personal task history.
- The scripts stay in the codebase repo. The data repo contains no code.
- Node 18+ or bun, no dependencies. Do not add a package.json to the data repo.

## Task

1. Create a private repository named `momentum-data` (GitHub, or any remote the
   user prefers — ask which). Clone it as a sibling of the codebase:

   ```
   Repos/
     momentum/          the app
     momentum-data/     this repo
   ```

2. Add a `.gitignore` covering editor and OS noise only. Nothing in this repo
   should be ignored on purpose — the point is that everything is versioned.

3. Seed it from the user's current data:
   - Ask them to open Momentum → **Data** → **Download a snapshot**.
   - Run:
     ```sh
     node ../momentum/scripts/momentum-data.mjs import <downloaded.json> --repo . --commit
     ```
   - Confirm with `status` that the task count matches what the Data view shows.

4. Verify the round trip before trusting it:
   ```sh
   node ../momentum/scripts/momentum-data.mjs build --repo . --out /tmp/check.json
   ```
   Compare `/tmp/check.json` against the original download with key ordering
   normalised. They must match exactly. If they do not, stop and report the
   difference — do not paper over it.

5. Push, and confirm the remote is private.

6. Write a short `SETUP.md` in the data repo recording: the remote URL, the
   codebase path the scripts are invoked from, and the date it was seeded.

## Optional, only if the user asks

- A scheduled task that reminds them to export and import weekly.
- A `sync.sh` in the data repo wrapping `import --commit` plus `git push`.

## Acceptance

- `momentum-data` exists, is private, and has at least one commit.
- `status` reports the same task total as the app's Data view.
- `build` reproduces the original export exactly.
- `git log` in the codebase repo shows no planner data was ever committed there.

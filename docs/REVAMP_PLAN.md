# Revamp Plan — Full Application Redesign (v0.4)

Translates all locked decisions from `DECISIONS-NEW.md` into a concrete
implementation plan. Covers every component, every file, and the order of work.

This is a **major version** — the app moves from plain CSS to Tailwind +
shadcn/ui, from localStorage to IndexedDB, and from a view-first to a
model-first architecture.

---

## Phase 0: Foundation — Tailwind + shadcn/ui + Dark Mode

**Why first.** Every subsequent phase builds on the component library and
theme system. Getting this right first means all views inherit dark mode,
accessibility, and consistent styling for free.

### 0.1 Tailwind CSS setup

| Action | Detail |
|---|---|
| Install Tailwind | `bun add -D tailwindcss @tailwindcss/vite` (Tailwind v4 uses the Vite plugin, no `tailwind.config.js` needed — config is CSS-first) |
| Configure Vite plugin | Add `@tailwindcss/vite` to `vite.config.ts` plugins array |
| Add Tailwind import | Add `@import "tailwindcss"` to `src/styles/global.css` |
| Remove old CSS | All component `.css` files are deleted or rewritten to Tailwind utilities |

### 0.2 shadcn/ui setup

| Action | Detail |
|---|---|
| Initialize shadcn | `bunx shadcn@latest init` — creates `components/ui/` directory, `lib/utils.ts` (the `cn` helper), and the theme tokens |
| Configure paths | `components.json` points to `src/components/ui` for components and `src/lib/utils` for the `cn` helper |
| Add base components | Install the shadcn components we need upfront: `button`, `card`, `input`, `textarea`, `select`, `dialog`, `dropdown-menu`, `tooltip`, `separator`, `scroll-area`, `tabs`, `badge`, `popover`, `command` (for fuzzy search) |
| Radix primitives | These come bundled with shadcn — no separate install needed |

### 0.3 Dark mode

| Action | Detail |
|---|---|
| Theme tokens | shadcn init creates CSS custom properties for `--background`, `--foreground`, `--primary`, `--muted`, `--border`, etc. in `:root` and `.dark` |
| Theme toggle | Add a `ThemeProvider` (lightweight context) + a toggle button in the sidebar header. Store preference in localStorage |
| Area colors in dark mode | Area colors are stored as CSS custom properties (`--area-college`, etc.) in `:root` and overridden in `.dark` with slightly brighter/desaturated variants for dark backgrounds |

### 0.4 Theme token for areas

```css
:root {
  --area-college: #287c76;
  --area-work: #a45c40;
  --area-projects: #4a7c9e;
  --area-health: #5b8c5a;
  --area-personal: #8e6b8e;
  --area-finance: #c49a3c;
  --area-relationships: #c06060;
}
.dark {
  --area-college: #3da89f;
  --area-work: #c47558;
  --area-projects: #6a9bbe;
  --area-health: #75a674;
  --area-personal: #a68ba6;
  --area-finance: #d4af4f;
  --area-relationships: #d47575;
}
```

These are mapped to Tailwind theme extensions so you can use
`bg-[var(--area-college)]` or a custom `bg-area-college` utility.

### 0.5 What gets deleted

| File | Action |
|---|---|
| `src/App.css` | Delete — replaced by Tailwind utilities |
| `src/components/*/View.css` (all 6) | Delete — replaced by Tailwind utilities |
| `src/components/ModeTabs/ModeTabs.css` | Delete |
| `src/components/DatePicker/DatePicker.css` | Delete |
| `src/styles/global.css` | Keep — but slim down to just Tailwind import + theme tokens + font-face declarations |
| Font-face declarations | Keep in `global.css` (Inter + Geist Mono self-hosted woff2) |

---

## Phase 1: Persistence — IndexedDB + Dexie.js

### 1.1 Install Dexie

```
bun add dexie
```

### 1.2 New files

| File | Purpose |
|---|---|
| `src/lib/persistence/db.ts` | Dexie database definition. Defines the `tasks`, `dailyEntries`, `weeklyEntries`, `habits`, `habitLogs` object stores + indexes. Schema version 2. |
| `src/lib/persistence/repository.ts` | Repository interface: `load()`, `save()`, `subscribe()`, `onQuotaError()`. Thin abstraction over Dexie so the hook doesn't depend on Dexie directly. |
| `src/lib/persistence/migrations.ts` | Migration registry: `[{ from: 1, to: 2, migrate }]`. Each migration transforms the data shape. |

### 1.3 Rewrite the hook

`src/hooks/usePlannerData.ts` — full rewrite:
- `load()` on mount (async, from IndexedDB via Dexie).
- Debounced auto-save (trailing 400ms).
- Skip-first-run guard (don't write back the just-loaded data).
- `try/catch` on every write with quota-error callback.
- Cross-tab sync: listen to `BroadcastChannel` for changes from other tabs.

### 1.4 Migration logic

On first launch with the new version:
1. Read existing `localStorage` key (`momentum.planner.v1`).
2. Transform v1 → v2 (field renames, status migrations, add new fields with
   defaults, remove legacy fields).
3. Write to IndexedDB.
4. Delete the old `localStorage` key.

After migration, `localStorage` is only used for:
- Theme preference (light/dark).
- Nothing else — all app data lives in IndexedDB.

---

## Phase 2: Data Model — `src/types/planner.ts`

### 2.1 New `DailyTask` shape

```typescript
type TaskStatus = "pool" | "planned" | "scheduled" | "doing" | "waiting" | "done";
type TaskPriority = "must" | "should" | "could" | "want";
type TaskArea = string; // area name, looked up in the Areas store

interface TaskRelationships {
  dependsOn: string[];
  blocks: string[];
  related: string[];
  followUpOf?: string;
}

interface DailyTask {
  id: string;                    // "T-20260714-0001" — immutable
  title: string;                 // ~120 char soft limit
  description?: string;          // optional, multi-line
  status: TaskStatus;
  priority?: TaskPriority;       // optional badge
  area?: TaskArea;               // optional, area name
  scheduledDate?: string;        // ISO date "YYYY-MM-DD"
  timeOfDay?: string;            // "15:00" or "14:00-16:00"
  relationships: TaskRelationships;
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  completedAt?: string;          // ISO timestamp, set when status → done
}
```

### 2.2 Changes to `DailyEntry`

```typescript
interface DailyEntry {
  date: string;                  // "YYYY-MM-DD"
  tasks: DailyTask[];            // tasks created/scheduled on this day
  note: string;                  // journal entry for this day
  taskReferences: string[];      // task IDs referenced in the journal note
}
```

Removed: `topFocus` (legacy, no UI uses it).

### 2.3 New: `Area` entity

```typescript
interface Area {
  id: string;                    // internal UUID
  name: string;                  // "College", "Work", etc.
  color: string;                 // hex color
  createdAt: string;
  archived: boolean;
}
```

Areas are stored as their own object store in IndexedDB. Pre-defined areas
(College, Work, Projects, Health, Personal, Finance, Relationships) are
seeded on first launch.

### 2.4 `PlannerData` version bump

```typescript
interface PlannerData {
  version: 2;
  daily: Record<string, DailyEntry>;
  weekly: Record<string, WeeklyEntry>;
  habits: Habit[];
  habitLogs: HabitLog[];
  areas: Area[];
  nextTaskId: number;            // global counter for T-YYYYMMDD-NNNN IDs
  updatedAt: string;
}
```

### 2.5 Migration v1 → v2

| Old field | New field | Transform |
|---|---|---|
| `status: "inbox"` | `status: "pool"` | Already done in v0.3 |
| `status: "inProgress"` | `status: "doing"` | Rename |
| `priority: "P1"` | `priority: "must"` | Rename |
| `priority: "P2"` | `priority: "should"` | Rename |
| `priority: "P3"` | `priority: "could"` | Rename |
| `priority: "P4"` | `priority: "want"` | Rename |
| `category` | (removed) | Drop field |
| `topFocus` | (removed) | Drop field |
| (none) | `id: "T-..."` | Generate stable ID for each existing task using its creation date + a counter |
| (none) | `relationships: {}` | Initialize empty relationships |
| (none) | `createdAt` / `updatedAt` | Set to current timestamp for existing tasks |
| (none) | `areas: [...]` | Seed the 7 default areas |
| (none) | `nextTaskId: N` | Set to the highest existing task counter + 1 |

---

## Phase 3: NLP Parser — `src/lib/nlp/taskParser.ts`

Pure utility. No UI, no React. Takes a string, returns parsed fields.

### 3.1 Parser contract

```
Input: "Buy groceries tomorrow 3pm must #health"
Output: {
  title: "Buy groceries",
  scheduledDate: "2026-07-15",
  timeOfDay: "15:00",
  priority: "must",
  area: "health"
}
```

### 3.2 Parsing order

1. **Area** — `#word`. Fuzzy-match against existing areas. If no match,
   flag for creation. Strip from title.
2. **Priority** — `must`, `should`, `could`, `want` (case-insensitive).
   Strip from title.
3. **Date** — relative ("today", "tomorrow", "next Monday", "in 3 days") and
   absolute ("July 14", "14/7", "Friday"). Strip from title.
4. **Time** — "3pm", "15:00", "2-4pm". Strip from title.
5. **Remaining text** = title. Trim.

### 3.3 Multi-line list parsing

Split on newlines. Parse each non-empty line independently. Return array of
parsed tasks. The calling component batch-creates them and shows a toast.

### 3.4 ID generation

```typescript
function generateTaskId(date: Date, counter: number): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `T-${ymd.slice(0, 4)}${ymd.slice(4, 6)}${ymd.slice(6, 8)}-${String(counter).padStart(4, "0")}`;
}
// → "T-20260714-0001"
```

Counter is `PlannerData.nextTaskId`, incremented after each task creation.

### 3.5 Inline highlighting

The Quick-Add input renders the text with inline `<span>` wrappers for
recognised tokens. CSS classes: `.nlp-area` (green), `.nlp-priority` (orange),
`.nlp-date` (blue), `.nlp-time` (purple). 180ms color transition.

---

## Phase 4: Today View — 3-Day Kanban

### 4.1 New component structure

```
src/components/PlannerView/
├── PlannerView.tsx           ← container, manages Today/Week/Month toggle
├── TodayView/
│   ├── TodayView.tsx         ← 3-column kanban layout
│   ├── QuickAdd.tsx          ← NLP input with inline highlighting
│   ├── TaskCard.tsx          ← compact card (dot + title + badge + time)
│   └── TaskCard.css          ← (deleted — Tailwind utilities)
├── WeekView/
│   └── ...
└── MonthView/
    └── ...
```

### 4.2 Today view layout

Three columns: **Yesterday | Today | Tomorrow**.

- **Yesterday**: tasks with `scheduledDate === yesterday` AND `status !== "done"`.
  If empty, the column collapses or shows a subtle "All caught up" state.
- **Today**: tasks with `scheduledDate === today` OR `status === "doing"`.
- **Tomorrow**: tasks with `scheduledDate === tomorrow`.

Each column header: weekday + date (`Wed 15`).

### 4.3 Quick-Add bar

At the top of the Today view. Single text input with NLP parsing.

- As the user types, recognised tokens are highlighted inline.
- **Enter** = create task. If a date is parsed, task goes to that day's
  column. If no date, task goes to **Pool**.
- **Shift+Enter** = create and stay (rapid multi-add).
- Multi-line paste → batch creation with toast.

### 4.4 Pool drawer

A collapsed drawer at the bottom or side of the Today view. Click to expand
and see untriaged tasks. Quick-Add bar can also route tasks here.

### 4.5 Keyboard navigation

Tab/Shift+Tab moves between cards. Arrow keys move within a column. Enter
opens inline edit. Space toggles completion. Delete removes (with confirm).

### 4.6 What's removed from current DailyView

| Element | Action |
|---|---|
| Task composer (textarea + selects + Add button) | Remove — replaced by Quick-Add |
| Per-task status dropdown | Remove — status is implicit from column placement |
| Task sections by status | Remove — replaced by day columns |
| Per-task priority badge | Keep — moved into TaskCard |
| Per-task check button | Keep — moved into TaskCard |
| Per-task title editing | Keep — inline edit on Enter |
| Per-task delete | Keep — keyboard shortcut |

---

## Phase 5: Week View — Sliding Strip + Unscheduled/Pool

### 5.1 Install dnd-kit

```
bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 5.2 Layout

**Top half:**
- Left/center: **Unscheduled** — tasks with `status === "planned"` and no
  `scheduledDate`, filtered to this week's scope. Quick-Add input here.
- Right: **Pool** — untriaged tasks + leftovers from last week. Quick-Add
  input here.

**Bottom half:**
- 7-day strip (Mon–Sun). Each day is a narrow column with compact task rows.
- Left/right arrows slide the week. CSS `translateX` animation, 250ms ease-out.
- Floating sticky heading shows the week range.

### 5.3 Drag-and-drop (dnd-kit)

- **Draggable**: tasks in the Unscheduled and Pool sections.
- **Droppable**: the 7 day columns in the bottom strip.
- On drop: update the task's `scheduledDate` to the dropped day.
- dnd-kit provides the smooth drag overlay + drop indicators.

### 5.4 Keyboard shortcut for day assignment

When a task is selected (highlighted):
- `Ctrl+Shift+1` → assign to Monday
- `Ctrl+Shift+2` → assign to Tuesday
- ...through `Ctrl+Shift+7` → Sunday

These shortcuts only fire when a task is focused/selected.

### 5.5 What's removed from current WeeklyView

| Element | Action |
|---|---|
| Critical Goals / Waiting On / Carry Forward | Remove — replaced by filtered task queries |
| Day cards showing task counts | Replace with compact task rows |
| Date picker at top | Replace with left/right week navigation arrows |
| Notes panel at bottom | Keep — move to a collapsible shadcn `Collapsible` |

---

## Phase 6: Month View — Dot Grid

### 6.1 Layout

Calendar grid. Each cell shows the date number + colored dots for scheduled
tasks.

- Dots colored by Area.
- Cap at 3 dots per cell; if more, show "+N".
- No completion %, no task counts, no P1 indicator.
- Click a day → navigates to Today view for that date.
- Left/right arrows navigate months. Slide animation.

### 6.2 What's removed from current MonthlyView

| Element | Action |
|---|---|
| Task count per day | Remove |
| Completed count per day | Remove |
| Completion % per day | Remove |
| P1 indicator | Remove |
| Date number | Keep |
| Calendar grid | Keep |
| Month navigation | Keep |
| Click-day gesture | Add — navigates to Today view |

---

## Phase 7: Habits — Minimal Changes

| Element | Action |
|---|---|
| Weekly habit matrix | Keep — restyle with shadcn `Card` + `Checkbox` |
| Add habit form | Keep — restyle with shadcn `Input` + `Button` |
| Archive/remove | Keep |
| Completion toggles | Keep — shadcn `Checkbox` |
| Percentages in overview | Keep absent |
| Streaks/metrics | Defer |

---

## Phase 8: Journal — @-mentions + Logseq Export

### 8.1 In-app Journal changes

| Element | Action |
|---|---|
| Date picker | Keep — restyle with shadcn `Popover` + calendar |
| Text area | Keep — restyle with shadcn `Textarea` |
| Recent entries list | Keep — restyle with shadcn `ScrollArea` |
| @-mention parsing | Add — typing `@` triggers a shadcn `Command` (fuzzy search) dropdown of tasks |
| `taskReferences` field | Add to `DailyEntry` — populated from @-mentions on save |
| Task ref display | Add — `@T-20260714-0001` renders as a clickable link inline |

### 8.2 Logseq markdown export

New button in the Data view: **"Export to Logseq"**.

- Exports one `.md` file per task into a user-chosen folder.
- File name: `T-20260714-0001.md`.
- Content: YAML frontmatter (status, priority, area, scheduledDate, createdAt,
  completedAt) + task title as the body.
- Logseq indexes the folder. User references tasks in their journal via
  `[[T-20260714-0001]]`.
- Re-exporting updates the files (Logseq picks up changes on reload).

---

## Phase 9: Data View — Version + Logseq Export

| Element | Action |
|---|---|
| JSON export | Update to emit v2 schema |
| JSON import | Update `validateImport` for v2. Add v1 import migration path |
| Data summary | Update to show new stats (total tasks, by area, by status) |
| Last updated | Read from IndexedDB |
| **Logseq export** | Add — markdown export per task (Phase 8.2) |

---

## Phase 10: Shared / Cross-cutting

### 10.1 App shell + sidebar

```
src/components/
├── AppShell.tsx               ← main layout (sidebar + workspace)
├── Sidebar.tsx                ← 4 nav items + theme toggle + brand
├── PlannerView/
│   ├── PlannerView.tsx        ← toggles Today/Week/Month
│   ├── TodayView/
│   ├── WeekView/
│   └── MonthView/
├── HabitsView/
├── JournalView/               ← (renamed from NotesView)
├── DataView/
└── ui/                         ← shadcn components
```

### 10.2 Keyboard shortcut system

A `useKeyboardShortcuts` hook that registers the global shortcuts (Tab, Enter,
Ctrl+Shift+1-7, etc.) and routes them to the active view.

### 10.3 Area color utility

A `getAreaColor(areaName: string)` function that looks up the area's color
from the CSS custom property or the Area entity. Used by TaskCard dots and
MonthlyView dots.

### 10.4 Theme provider

A `ThemeProvider` context (light/dark) + a toggle button in the sidebar.
Stores preference in localStorage. Applies/removes the `dark` class on
`<html>`.

---

## Dependency changes summary

| Package | Action | Why |
|---|---|---|
| `tailwindcss` + `@tailwindcss/vite` | Add | CSS framework for shadcn |
| `shadcn/ui` components | Copy in | Component library (not a dependency — source is owned) |
| `@radix-ui/*` | Add (via shadcn) | Accessible primitives underneath shadcn |
| `dexie` | Add | IndexedDB wrapper |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | Add | Drag-and-drop for Week view |
| `lucide-react` | Keep | Icons (already installed) |
| `react`, `react-dom` | Keep | Already installed |
| `chrono-node` | Do NOT add yet | NLP parser is custom regex. Add only if date edge-cases grow. |
| `framer-motion` | Do NOT add | Animations are CSS transitions. |

---

## Execution order

```
Phase 0:  Foundation (Tailwind + shadcn + dark mode)
    ↓
Phase 1:  Persistence (IndexedDB + Dexie + migration)
    ↓
Phase 2:  Data model (types + v1→v2 migration logic)
    ↓
Phase 3:  NLP parser utility
    ↓
Phase 4:  Today view (3-day kanban + Quick-Add + Pool drawer)
    ↓
Phase 5:  Week view (unscheduled/pool top + 7-day strip + dnd-kit)
    ↓
Phase 6:  Month view (dot grid)
    ↓
Phase 7:  Habits (minimal restyle with shadcn)
    ↓
Phase 8:  Journal (@-mentions + taskReferences)
    ↓
Phase 9:  Data view (v2 export + Logseq markdown export)
    ↓
Phase 10: Shared (keyboard shortcuts, area colors, theme provider)
```

Each phase produces a working, ship-able increment. No half-finished states.

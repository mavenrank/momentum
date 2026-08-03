# Decisions — Consolidated & Locked

All decisions from the research and discussion rounds. Items marked **LOCKED**
are final for the v0.4 revamp. Items marked **DIRECTIONAL** have a clear
preference but may be refined during implementation.

---

## 1. Persistence / Storage — LOCKED

**IndexedDB + Dexie.js** as the primary store. JSON export/import stays as the
portability layer.

- Async, non-blocking reads/writes.
- Transactions for data integrity.
- Schema versioning with explicit migration registry.
- Debounced auto-save (trailing ~400ms), skip-first-run guard.
- Quota error surfacing via UI callback.
- Cross-tab sync via BroadcastChannel.
- Migration: read existing localStorage on first launch → transform v1→v2 →
  write to IndexedDB → delete old localStorage key.

**File System Access API (draw.io's approach)** was researched and rejected —
it requires per-file permission prompts, unsuitable for a daily-use app that
autosaves constantly.

---

## 2. UI Framework — LOCKED

**shadcn/ui + Tailwind CSS + Radix UI primitives.**

This **reverses** the original "no Tailwind" constraint from the project brief.
The trade-off: shadcn gives us accessible, flexible, themeable components
(including dark mode) out of the box, which is worth the Tailwind adoption.

- All existing component CSS files will be migrated to Tailwind utilities.
- shadcn components are copied into the project (not installed as a dependency)
  — full source ownership.
- **Light mode + Dark mode** via Tailwind's `dark:` variant + a theme toggle.
- CSS custom properties for area colors remain (they're data-driven, not
  component-driven).

---

## 3. Sidebar Structure — LOCKED (for now)

Left sidebar with 4 top-level items:

```
┌──────────────────┐
│  Momentum        │
│  ─────────────   │
│  ● Planner       │  ← workspace with Today/Week/Month toggles inside
│  ● Habits        │
│  ● Journal       │
│  ● Data          │
└──────────────────┘
```

- **Planner** is one sidebar item. Inside the workspace, top-level toggles
  switch between **Today | Week | Month**. These are lenses on the same task
  data.
- **Habits**, **Journal**, **Data** are separate top-level items.
- **Pool** is NOT a sidebar item — it's a status. It appears as a drawer in
  the Today view and a panel in the Week view.
- Future consideration: switch to a top-level nav bar (saves horizontal space
  since there are only 4 items). Deferred for now.

---

## 4. Views — LOCKED

### Today view (3-day kanban: Yesterday / Today / Tomorrow)

```
┌──────────────────────────────────────────────────────────────┐
│  Wed 15 Jul         3 scheduled · 1 waiting · 0 overdue      │
│  [+ quick add bar with NLP ]                                 │
├──────────────┬──────────────┬───────────────────────────────┤
│  Yesterday    │  Today        │  Tomorrow                     │
│  Tue 14      │  Wed 15       │  Thu 16                       │
├──────────────┼──────────────┼───────────────────────────────┤
│ ● Submit     │ ● Buy groc.   │ ● Call dentist                │
│   assignment │   3pm Must #h │   9am Should #h               │
│   P1 #c      │              │                               │
│              │ ● GRE prac    │                               │
│              │   2pm Should  │                               │
│              │   #c          │                               │
└──────────────┴──────────────┴───────────────────────────────┘
```

- **Yesterday** column: tasks scheduled for yesterday that are NOT done.
  Lets you triage leftovers (pull into Today, push to Tomorrow, send to Pool,
  mark done late).
- **Today** column: tasks with `scheduledDate === today` OR `status === "doing"`.
- **Tomorrow** column: tasks with `scheduledDate === tomorrow`.
- Column headers show weekday + date (`Wed 15`), not "Day After."
- Keyboard nav: Tab/Enter/Shift+Enter/Alt+Enter/Arrows/Space.
- **No drag-and-drop here** — this is the execution view, not the planning
  view. Keyboard only.
- Quick-Add bar at top with NLP parsing + inline token highlighting.

### Week view (sliding strip + unscheduled/pool top)

```
┌──────────────────────────────────────────────────────────────┐
│  Week 28 — Jul 7–13           ◀  ▶                          │
├──────────────────────────────────────┬───────────────────────┤
│  Unscheduled (this week)             │  Pool                 │
│  ─────────────────────────           │  ──────────────       │
│  ● Read paper                        │  ● Buy SSD             │
│  ● Organize docs                     │  ● Email prof          │
│  ● GRE practice                      │  [+ quick add]         │
│  [+ quick add]                       │                       │
├──────────────────────────────────────┴───────────────────────┤
│  Mon 7 │ Tue 8 │ Wed 9 │ Thu 10 │ Fri 11 │ Sat 12 │ Sun 13  │
│  ● Buy │ ● Call│ ● Buy │ ● Sub  │ ● GRE  │        │         │
│   groc │   dent │   groc│   ass  │   prac │        │         │
│   3pm  │   9am  │       │   Must │   2pm  │        │         │
└────────┴────────┴────────┴────────┴────────┴────────┴─────────┘
```

- **Top half**: Left = Unscheduled (committed to this week, no day assigned).
  Right = Pool (untriaged raw tasks + leftovers from last week). Both have
  quick-add inputs.
- **Bottom half**: 7-day strip. Compact task rows: colored dot + truncated
  title (ellipsis) + time if set.
- **Moving tasks from top to bottom**: BOTH drag-and-drop (via `@dnd-kit`)
  AND keyboard (`Ctrl+Shift+1` for Monday through `Ctrl+Shift+7` for Sunday).
  Keyboard shortcut only active when a task is selected (highlighted).
- Left/right arrows slide the week with a CSS animation (250ms ease-out).
- Floating sticky heading shows the week range.
- Long titles truncated with ellipsis. Full title on hover/focus.

### Month view (dot-grid navigation)

```
┌────────────────────────────────────────────────┐
│  July 2026                        ◀  ▶         │
├─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┤
│     │     │  1  │  2  │  3  │  4  │  5  │     │
│     │     │  •• │  •  │     │  •  │     │     │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│  6  │  7  │  8  │  9  │ 10  │ 11  │ 12  │ 13  │
│  •  │ ••  │     │  •  │  •  │     │     │ ••  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

- Calendar grid with colored dots for scheduled tasks.
- Dots colored by **Area** (matches task card dots).
- **No completion %, no task counts, no P1 indicator.**
- Click a day → navigates to Today view for that day.
- Left/right arrows navigate months with slide animation.

---

## 5. Quick Add / NLP — LOCKED

Single text input (always visible at top of Today view, floating on mobile).
Parses one or more lines of text into structured tasks.

### Parsing rules (regex, no external library)

1. **Area** — `#college`, `#work`, `#projects`, `#health`, `#personal`,
   `#finance`, `#relationships`. Also supports creating new areas on-the-fly
   if the `#tag` doesn't match an existing area. Highlighted green.
2. **Priority** — `must`, `should`, `could`, `want` (case-insensitive).
   Highlighted orange.
3. **Date/time** — relative ("today", "tomorrow", "in 3 days", "next Monday")
   and absolute ("July 14", "14/7", "Friday"). Time: "3pm", "15:00", "2-4pm".
   Highlighted blue.
4. **Remaining text** = task title.

### Multi-line list parsing

Paste a bulleted/numbered list → split on newlines → parse each line
independently → batch-create tasks. Toast: "N tasks created."

### Area selector UX

- Type `#` → fuzzy-search dropdown of existing areas.
- **Tab** = complete the closest match.
- **Enter** = select highlighted area.
- If typed area doesn't exist → Enter creates it.

### Inline highlighting

Recognised tokens get inline `<span>` wrappers with CSS transitions
(180ms ease). Pure CSS, no library.

### Replaces

The current task composer (textarea + status select + priority select + Add
button) is entirely removed.

---

## 6. Task IDs — LOCKED

**Format: `T-YYYYMMDD-NNNN`**

- `T-20260714-0001` = first task created on July 14, 2026.
- `T-20260714-0002` = second task created on July 14.
- `T-20261026-0003` = third task created on Oct 26 (global counter continues).

### Properties

- **Immutable** — never changes, even if the task is rescheduled or its
  parent is deleted.
- **Global counter** — `NNNN` increments across all tasks ever, not per-date.
  Stored as `PlannerData.nextTaskId`.
- **Date prefix** — human-readable + sortable. Tells you when the task was
  created at a glance.
- **No relationship encoding** — the ID identifies the task. Nothing else.

### Relationships (separate field)

```typescript
interface TaskRelationships {
  dependsOn: string[];    // task IDs this task is blocked by
  blocks: string[];       // task IDs this task blocks
  related: string[];      // loosely related task IDs
  followUpOf?: string;    // parent task ID (if this is a follow-up)
}
```

- Stored as `relationships` on `DailyTask`.
- Graph, not tree — a task can have multiple dependencies, can block
  multiple tasks, and follow-ups can have their own follow-ups.
- No `-N` suffixes on IDs. The relationship is in the data, not the ID.

---

## 7. Priority — LOCKED

Renamed from P1–P4 to **Must / Should / Could / Want**.

| Old | New | Color | Meaning |
|---|---|---|---|
| P1 | **Must** | Red | Critical, non-negotiable |
| P2 | **Should** | Orange | Important, should do |
| P3 | **Could** | Blue | Nice to have |
| P4 | **Want** | Grey | Low-effort, aspirational |

### Visual axes (two separate channels)

- **Dot color** = Area (what part of life). 8px circle before the title.
- **Priority badge** = Must/Should/Could/Want. Small colored badge.
- Both are optional on every task.

---

## 8. Areas — LOCKED

Pre-defined: `College`, `Work`, `Projects`, `Health`, `Personal`, `Finance`,
`Relationships`. Users can create new areas on-the-fly via `#newarea` in
the Quick-Add input.

| Area | Color |
|---|---|
| College | Teal `#287c76` |
| Work | Terra cotta `#a45c40` |
| Projects | Steel blue `#4a7c9e` |
| Health | Sage green `#5b8c5a` |
| Personal | Mauve `#8e6b8e` |
| Finance | Gold `#c49a3c` |
| Relationships | Warm red `#c06060` |

Colors are stored as CSS custom properties in `:root` and as Tailwind theme
tokens so dark mode can override them.

---

## 9. Status Names — LOCKED

| Status | Meaning |
|---|---|
| **Pool** | Raw dump, not yet triaged |
| **Planned** | Selected as worth doing |
| **Scheduled** | Has a date (implicit when `scheduledDate` is set) |
| **Doing** | Actively working on |
| **Waiting** | Blocked by external event |
| **Done** | Completed |

**"Unscheduled"** = the bucket name for tasks with `status === "planned"` but
no `scheduledDate`. Shown as a section in the Today view and the top-left of
the Week view.

---

## 10. Task Display — LOCKED

- **Colored dot** (8px circle, area color) before the title.
- **Title**: single line, truncated with ellipsis if too long (~120 char soft
  limit). Full title on hover/focus.
- **Time**: shown inline after truncated title if set (e.g., `... 3pm`).
- **Priority badge**: small colored badge after the title.
- **Compact layout** in week strip. Slightly larger card-style in the today
  kanban.

---

## 11. Task Description — DIRECTIONAL

Add optional `description?: string` field.

- Title: ~120 chars, single line, always shown.
- Description: multi-line, optional, shown in detail/expand view.
- Future search bar: fuzzy search across title + description.

---

## 12. Keyboard Navigation — LOCKED

| Key | Action |
|---|---|
| **Tab** | Move focus to next card/field |
| **Shift+Tab** | Move focus to previous card/field |
| **Enter** | Quick-Add: create task. Task card: open inline edit. |
| **Shift+Enter** | Create task and stay in Quick-Add |
| **Alt+Enter** | Insert line break (multi-line title/description edit) |
| **Arrow keys** | Navigate between cards within a column |
| **Space** | Toggle task completion |
| **Delete/Backspace** | Delete selected task (with confirmation) |
| **Ctrl+Shift+1–7** | In Week view: assign selected task to Mon–Sun |

### Drag-and-drop scope

- **Today view**: No drag-and-drop. Keyboard only.
- **Week view**: Both drag-and-drop (via `@dnd-kit`) AND keyboard
  (`Ctrl+Shift+1–7`). This is the planning view where spatial distribution
  makes sense.

---

## 13. Follow-up Task Relationships — LOCKED

Both manual + auto-prompt:

- "Follow up…" button on the task row → inline editor ("in N days" + title).
- On completion: auto-prompt "Done. Schedule a follow-up?" with presets
  (3 days, 1 week, 2 weeks, custom).
- Follow-up carries `followUpOf: <parentId>` and starts in `Pool`.
- No "hasFollowUp" flag on parent — look up children by `followUpOf`.
- Chains allowed.

---

## 14. Journal + Logseq Integration — LOCKED (phased)

### Phase 1 (this revamp): in-app Journal + markdown export

- Keep Journal mode in-app.
- Add `taskReferences: string[]` to `DailyEntry` (seam).
- In the Journal textarea, typing `@` triggers a fuzzy-search dropdown of
  tasks by title or ID. Selected tasks insert as inline clickable links
  (`@T-20260714-0001`).
- On save, `taskReferences` is populated from the @-mentions.
- **Logseq export** in the Data view: exports one `.md` file per task into a
  folder the user chooses (e.g., `Logseq/pages/Planner Tasks/`). Each file has
  YAML frontmatter (status, priority, area, dates) + the task title as
  content. Logseq indexes the folder automatically. User references tasks in
  their journal via `[[T-20260714-0001]]`.

### Phase 2+ (later)

- Logseq plugin that calls a local HTTP API
  (`http://localhost:PORT/task/T-20260714-0001`) and renders live task data
  inline in Logseq blocks.
- Reverse integration: Planner watches the Logseq graph and shows "Referenced
  in: July 14 Journal, DSA Notes" on the task detail page.

---

## 15. Habits — LOCKED (minimal changes)

- Keep the weekly matrix grid, add/archive, daily toggles.
- No percentages, streaks, or metrics in the overview.
- Metric detail page deferred.

---

## 16. Animations — LOCKED

Pure CSS transitions, no animation library.

| Element | Animation |
|---|---|
| NLP token recognition | Color change, 180ms ease |
| Week/month navigation slide | CSS `translateX`, 250ms ease-out |
| Task completion | Strike-through + fade, 180ms ease |
| shadcn component transitions | Built-in (Radix handles these) |

---

## 17. Order of Work — LOCKED

1. Foundation: Tailwind + shadcn/ui + dark mode setup
2. Persistence: IndexedDB + Dexie.js + migration
3. Data model: types + migration logic (v1 → v2)
4. NLP parser: quick-add utility
5. Today view: 3-day kanban (Yesterday/Today/Tomorrow)
6. Week view: unscheduled/pool top + 7-day strip + dnd-kit
7. Month view: dot grid
8. Habits: minimal changes
9. Journal: @-mentions + taskReferences seam
10. Data view: version update + Logseq markdown export
11. Shared: area colors, keyboard shortcuts, animations

Each phase is independently ship-able.

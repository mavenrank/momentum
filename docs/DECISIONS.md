# Open Decisions — Gathering Phase

Research gathered from surveying ~10 planner/journal/task apps. Nothing here is
locked. Each item shows what other apps do, the user's reaction to them, and
what remains to decide.

---

## 1. Views selection — avoiding the corporate feeling

**Problem.** Daily/Weekly/Monthly views must not feel like Jira, Trello, Asana,
or any project-management tool. They need to feel personal, execution-oriented,
and lightweight.

**Research context (what the apps do).**

- **Things 3 — closest to what we want.**
  - Hierarchy: Areas → Projects → Headings → Tasks.
  - Scheduling views: **Today** (tasks due/planned for today), **This Evening**
    (evening-only bucket), **Upcoming** (all tasks with scheduled dates, shown
    as a calendar strip, not a grid), **Anytime** (unscheduled tasks that are
    committed), **Someday** (deferred ideas).
  - The system works because *every task lives in an Area first* — you never see
    a flat list of all tasks. Every view is a lens filtered by time + area.
  - No kanban, no columns, no drag-to-column. The "status" is implicit (where
    the task is in the time hierarchy).

- **Vikunja — useful for views, risk of overkill.**
  - 6 views per project: List, Kanban, Gantt, Table, Calendar, Timeline.
  - The **Kanban** and **Gantt** views tilt corporate. The **List** and
    **Calendar** views feel personal. The **Table** view is spreadsheet-like
    (useful but not personal).
  - Takeaway: we want a subset — List + Calendar. Maybe a compact Kanban if it
    stays 3-column (Today/Tomorrow/Day after — see §5 below).

- **Open Sunsama — three-day Kanban is viable.**
  - Divides work into a 3-column horizontal board: **Today | Tomorrow | Day
    After**. Each column is a real day, not a status.
  - Includes: task title, priority badge (P1–P4), time estimate, project
    tag. No swimlanes, no epic grouping, no assignees.
  - This avoids the "5-column Inbox→Planned→Doing→Waiting→Done" corporate
    kanban feel because the columns are *days*, not workflow states. It answers
    "what am I doing when?" instead of "what's the status?"
  - Missing from our current app: time slots, time limits, time blocking.
    Stopwatch/timer is not needed.

- **Todoist — standard today/upcoming but too task-list focused.**
  - Inbox / Today / Upcoming / Next 7 Days / Filters. No "day card" concept.
  - Strong for quick capture, weak for *planning* a day visually.

- **WeekToDo — sliding week view, great for weekly planning.**
  - Single horizontal week strip with 7 columns (Mon–Sun). Left/right arrow
    buttons slide forward/backward a week each. Subtle slide animation.
  - Tasks inside a day are shown as compact rows with colored dots (not cards).
    Long titles are truncated with ellipsis, time is shown inline.
  - A floating heading shows where the current week ends and the next begins,
    fixed as you scroll.
  - This is our best reference for the Weekly view: sliding weeks, compact rows,
    colored dots, overflow hidden.

- **OpenProject / Plane — anti-patterns.**
  - Corporate: cycles, sprints, epics, velocity charts, workload graphs,
    burndowns. This is what Momentum must not become.

**User's reaction to naming.**
- "Anytime" (Things 3 term) is confusing. Better: **Unscheduled** or something
  closer to the meaning of "committed but not timebound."
- "This Evening" is a useful bucket but the name may need localisation.

**What remains to decide.**
- Which views do we ship in v0.4? (Candidate: Today strip + 3-day Sunsama-style
  kanban + sliding WeekToDo-style week + monthly dot-grid.)
- What do we call the "committed but unscheduled" bucket?
- Do we need a "This Evening" distinction, or is that over-engineering?

---

## 2. Quick Add Magic / Natural Language Parsing (must-have)

**Research context.**
- **Todoist** has the gold standard: type `"Buy groceries tomorrow at 5pm p1
  #personal"` and it sets date, time, priority, project from one string.
  Recognised tokens get *subtle highlighting* — the date turns blue, priority
  gets coloured, the project tag turns green.
- **Vikunja** calls theirs "Quick Add Magic": mention a date in the task title
  and it auto-adds as a due date. Has special keywords for labels and
  assignees.
- **Things 3** has a Quick Entry box with autofill. Type "next Friday" and it
  bolds the recognised date. Type an area/project name and it auto-links.
- **TickTick** has similar natural language input with date + list + priority
  parsing and inline highlighting.

**User's extension of the idea.**
- The parser should also handle rough **numbered or bulleted lists** pasted in
  one go. Each line is parsed independently via the same NLP, creating multiple
  tasks from a single paste action. Example:
  ```
  - Buy groceries tomorrow p2
  - Call dentist Monday 3pm #health
  - Submit assignment Friday
  ```
  becomes 3 tasks, each with its own parsed date/area/priority.

**What to decide.**
- Extent of NLP: just dates + areas + priority, or also recurrence ("every
  Monday"), time ranges ("2-4pm"), and follow-up prompts ("and follow up in 3
  days")?
- Highlighting animation: colour change + subtle pulse (like AFFiNE's
  subtleness) on recognised tokens.
- Where does the Quick Add live? (Always-accessible bar at the bottom? A
  floating hotkey-triggered box like Todoist's "q"?)
- Stacking validation: if the NLP is wrong, how does the user correct it before
  creating the task?

---

## 3. Keyboard navigation instead of drag-and-drop

**Decision direction.** The user explicitly does NOT want drag-and-drop for a
personal planner. Feels too corporate (Jira/Trello muscle memory).

**Alternative.** Excel/Google Sheets keyboard shortcut behaviour:
- **Tab** — move to next field (e.g., from title → priority → date).
- **Enter** — confirm/create and move to next row.
- **Shift+Enter** — create and stay on same field (quick multi-create).
- **Alt+Enter** — insert line break within a field (for multi-line task titles
  or notes).
- **Arrow keys** — navigate between tasks/cells without a mouse.

**What to decide.**
- Full cell-like editing (click a task → all fields editable inline) or a modal
  for detail editing?
- Which shortcut set to use: Google Sheets style (Tab moves right, Enter moves
  down) or Todoist style (q to quick-add, arrows to navigate)?
- Do we need an optional mouse-friendly mode for tablet users?

---

## 4. Three-day kanban (Today / Tomorrow / Day After) — from Open Sunsama

**Research context.**
- Open Sunsama's kanban uses days as columns, not workflow statuses. This is
  the key insight: the columns are **Today | Tomorrow | Day After** (rendered
  as weekday names like "Mon 14 | Tue 15 | Wed 16").
- Each column contains tasks scheduled for that day, shown as compact cards
  with: title, P1-P4 badge, time estimate, colored dot for area.
- Tasks can be moved between days via keyboard shortcuts (not drag).
- This avoids the "5-column workflow" feel entirely because the columns are
  *temporal*, not procedural.

**How this fits our model.**
- Our `scheduledDate` field maps directly. A task with `scheduledDate = today`
  appears in the Today column. Tomorrow → Tomorrow column. Day after → Day
  After column.
- Tasks with `scheduledDate` further out go into a normal day list.
- Tasks with no `scheduledDate` live in the **Unscheduled** section (see §1).

**What to decide.**
- 3-day view or 5-day (Mon–Fri) view? (WeekToDo does 7-day but that may be too
  narrow for cards.)
- Should this replace the current Daily view, or augment it?
- Time slot / time blocking integration (see §11).

---

## 5. Monthly view redesign (navigation, not metrics)

**Research context.**
- **Things 3**: No monthly view at all. The "Upcoming" view is a linear list of
  dated tasks. Calendar is handled by the system calendar app.
- **TickTick**: Monthly calendar grid shows dots per task, not percentages.
  Clicking a day opens the daily task list for that day. No completion stats.
- **Lunatask**: Daily calendar with time blocks. Monthly = simple grid with
  dots. No metrics.
- **Vikunja**: Calendar view shows tasks on their due dates as cards.

**User's confirmed direction.**
- No completion %, no task counts, no P1 indicator.
- Calendar grid with dots (one dot per scheduled task, not per task).
- Click a day → opens that day's execution view.
- Maybe a small side panel for "important dates" (deadlines, events).

**What to decide.**
- Dot semantics: one dot per task? One dot per area (colored by area)? Capped
  at N dots and a "+N" overflow?
- Empty days: show "free" signal (grey/white difference) or just blank?
- Scrolling: one month at a time (arrows) or continuous vertical scroll
  (infinite months)?

---

## 6. AFFiNE-style subtle animations

**Research context.**
- AFFiNE has subtle micro-animations everywhere: cards expanding/shrinking,
  database rows "snapping" into view, colour transitions on recognised blocks.
  Not overwhelming — just enough to make the UI feel alive.
- WeekToDo also has a subtle slide animation when navigating weeks. Left/right
  arrows slide the week strip in/out.
- Todoist highlights recognised NLP tokens with colour changes (blue for dates).

**User's reaction.** Likes AFFiNE's subtle animations. Wants similar treatment:
- NLP token recognition → subtle colour shift + small pulse/glow.
- Week sliding → smooth translate animation.
- Task completion → smooth strike-through (already implemented, can be refined).

**What to decide.**
- Do we write custom CSS animations, or use a lightweight library (framer-motion
  is 30 kB gzipped — overkill for mostly CSS transitions; CSS transitions cover
  90% of cases here)?
- Animation timing: what feels "subtle" vs "annoying"? (Target: 180–250ms
  ease-out for most transitions.)

---

## 7. Task display: colored dots, time truncation, overflow — from WeekToDo

**Research context (WeekToDo).**
- Each task gets a **colored dot** (configurable per task/project/area). In the
  list/week view, the dot is the primary visual differentiator.
- Tasks with a **time limit** display it inline after the title. The title is
  truncated with ellipsis to fit, and the time shows at the end:
  `Grocery shopping... 2pm–3pm`
- Long titles don't break the list layout — single-line truncation with
  ellipsis. Full title visible on hover/expand.
- The **custom lists** concept at the bottom of WeekToDo is interesting but the
  user doubts we'll implement it.

**User's reaction.** The colored dot system is great for our Area model (area
determines the dot colour). The time-truncation pattern solves the "long task
titles break the weekly grid" problem we'd otherwise face.

**What to decide.**
- Dot color source: area colour, priority colour, or manual override?
- Hover/expand for long titles: tooltip, click-to-expand-row, or modal?
- Do we keep the current "task row" design (full-width, structured columns) or
  move to a more compact WeekToDo-style list?

---

## 8. "Unscheduled" instead of "Anytime" (Things 3 naming)

**Research context.**
- Things 3 calls committed-but-undated tasks **"Anytime"**. The user finds this
  confusing — it sounds like "whenever" rather than "committed, waiting for a
  date."
- The semantic distinction: **Unscheduled** = "I intend to do this, I just
  haven't assigned a day yet." Versus **Pool** = "raw untriaged thoughts."
- Vikunja doesn't have this concept — tasks are either in a list or they're not.
- Todoist calls this **"No date"** (tasks without a due date show in their
  project but not in Today/Upcoming).

**User's preference.** Prefers **Unscheduled** over Anytime. Also wants a
clean distinction between:
- **Pool** — raw dump, not yet triaged (locked as the name).
- **Unscheduled** — triaged, committed, worth doing, no date assigned.
- **Scheduled** — triaged + dated.
- **Doing** — actively working on.
- **Waiting** — blocked by external event.
- **Done** — completed.

**What to decide.** Lock "Unscheduled" as the name.

---

## 9. Natural language list parsing (extension of NLP)

**User's idea.** The NLP should accept a rough numbered/bulleted list pasted in
one go. Each line is independently parsed:

```
- Buy groceries tomorrow p2 #health
- Call dentist Monday 3pm #health
- Submit assignment Friday p1 #college
```

→ Three tasks created simultaneously, each with date/area/priority parsed from
that line.

**Research context.**
- No existing app does this (Todoist parses one task at a time; Vikunja's Quick
  Add Magic is per-task).
- The closest is Todoist's "quick add" being triggered repeatedly via
  keyboard shortcuts. But multi-line paste → multi-task creation doesn't exist
  in the surveyed apps.

**What to decide.**
- Separator: newline only? Also blank-line-separated groups?
- Error handling: if one line fails to parse, does the whole batch fail, or
  does it create the unparseable lines as plain Pool tasks with a warning?
- Feedback: show a temporary "3 tasks created" toast? Show a mini-review step
  before creation?

---

## 10. Follow-up task relationships

**Research context.**
- **Vikunja** has explicit task relation kinds: `subtask`, `related`,
  `blocked-by`, `duplicates`. You manually create the relation; there's no
  auto-prompt on completion.
- **Super Productivity** has no task relations. Follow-ups are handled via
  subtasks (parent stays open until subtasks close).
- **Things 3 / Todoist / TickTick**: No explicit follow-up system. Users create
  a new task with a future start date manually.
- **Conclusion**: none of the major apps have auto-create follow-ups. This would
  be a novel feature.

**User's position.** Unsure how far to take it. The idea of task relations is
sound but the implementation extent needs thought.

**What to decide.**
- Just a `followUpOf` field on `DailyTask` (structural only, no UI automation)?
- Or a "Schedule follow-up?" prompt on completion (with quick presets)?
- Or both (manual link + auto-prompt)?
- Chains allowed (follow-up of a follow-up)?

---

## 11. CalDAV — what is it and why does it matter?

CalDAV (RFC 4791) is an internet protocol that lets client apps read and write
calendar data on a server. Think of it as **IMAP for your calendar** — a
standard way to sync events between devices without being locked to a single
vendor.

**Why it matters for momentum-style apps.**
- Vikunja, Nextcloud Tasks, and many self-hosted apps use CalDAV so that tasks
  with due dates appear in Apple Calendar, Thunderbird, Outlook, or any
  CalDAV-compatible client.
- For a local-first app like Momentum, CalDAV would be an **optional sync
  layer**: you set up a CalDAV server (e.g., Nextcloud, Baikal, or any
  provider) and Momentum pushes/pulls tasks with scheduled dates to/from it.
- This means your tasks appear on your phone's calendar, your desktop calendar,
  etc., without Momentum needing to be a full calendar app itself.
- **Not needed for v0.4** but good to know about for Phase 2 (portability) or
  Phase 4 (multi-device).

---

## 12. Lunatask's CRM — what it is and how it works

CRM = Customer Relationship Management, but applied to **personal life** rather
than business customers.

**Lunatask's implementation (v2, added 2025):**
- A **People / Relationships** section alongside Tasks, Habits, Journal, and
  Notes.
- Features:
  - **Customisable fields**: name, notes, birthday, anniversary, phone, email,
    custom tags, any field type.
  - **Timeline of shared memories**: each person has a timeline where you can
    log interactions ("Had coffee, talked about X"). Entries are typed in free
    form, similar to a journal entry but attached to a person.
  - **Reconnect rules**: "If I haven't interacted with X in 2 weeks, remind
    me." The app surfaces stale relationships in a separate view.
  - **Relationship hierarchy visualisation**: shows how people are connected
    (friends → friends-of-friends, groups, circles).
- The CRM is **integrated with the journal** — a journal entry can @-mention
  a person, and that person's timeline shows the entry.
- **Encrypted** — end-to-end like everything else in Lunatask.

**Relevance to Momentum.**
- Not directly relevant for v0.4 (we're focused on daily planning first).
- However, the **@-mention linking** pattern (journal entry @-mentions a task
  or person) is the same loose-coupling approach we want for task↔journal
  integration.
- The **reconnect rule** concept could later apply to our `Waiting` tasks —
  "if a Waiting task has no update in N days, surface it."

---

## 13. Order of work: persistence vs daily revamp

**Research context (persistence patterns from surveyed apps).**
- **WeekToDo**: uses localStorage only. Works for small datasets. No sync, no
  quota handling. Instructive for what to avoid at scale.
- **Super Productivity**: localStorage + sync via WebDAV/Dropbox/OneDrive. Sync
  is file-based (they export to a file, sync the file). Simple but you can lose
  data if two devices write simultaneously.
- **AFFiNE**: uses IndexedDB + CRDTs (OctoBase). Async writes, transactions,
  multi-tab sync via BroadcastChannel, conflict resolution via CRDT. The most
  sophisticated pattern.
- **General consensus (2025-26)**: localStorage is fine for config flags, but
  for app data use **IndexedDB** with a wrapper like **Dexie.js** (simplifies
  the API, adds transactions, schema versioning, query indexes). See references
  in `docs/DEEP_DIVE.md` item #1.

**Recommendation (unchanged).** Persistence rewrite first. The daily revamp
needs debounced writes for keyboard navigation and quick-add to feel
responsive.

**What to decide.**
- Which IndexedDB wrapper? (Dexie.js is the standard. ~15 kB gzipped, mature.)
- Migration path: read existing localStorage into IndexedDB on first launch?
  Or two-phase (keep localStorage, start writing to IndexedDB, delete
  localStorage after migration confirmed)?
- JSON export/import stays as the portability layer (it's file-based,
  not storage-mechanism-dependent).

---

## Previously locked decisions (record)

- **Pool** — locked as the name for the raw/untriaged status (replaces `inbox`).
- **Areas coexist with P1-P4** — Area indicates "what part of life," P1-P4
  indicates "how urgent." Both are optional on each task.
- **Scheduled is implicit** — setting `scheduledDate` auto-promotes a task to
  `scheduled` status.
- **Journal decoupling leaves a seam now, splits later** — `taskReferences` on
  `DailyEntry` + optional `ref: T-102` on `DailyTask`.
- **Follow-up = both manual + auto-prompt on completion** — structural
  relationship, not a tag.
- **Persistence first, then daily revamp** — order of work.

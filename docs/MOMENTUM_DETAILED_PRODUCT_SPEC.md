# Momentum Detailed Product Specification

## 1. Project Identity

### 1.1 Name

The project is named **Momentum**.

### 1.2 Purpose

Momentum is a local-first planning, journaling, and accountability application.
It began as a digital version of a physical weekly planner page and has evolved
toward a more complete personal planning system.

The app is intended to help with:

- Planning daily execution.
- Seeing weekly commitments and waiting items.
- Reviewing monthly progress.
- Tracking habits.
- Keeping a journal.
- Exporting and importing data between laptops.
- Preparing for future accountability-buddy features.

### 1.3 Intended User

The primary user is an individual managing a busy schedule with college,
projects, exams, learning goals, and personal tasks.

The app should support workflows such as:

- College assignments.
- GRE or IELTS preparation.
- Long-running projects such as the Momentum planner itself.
- Certification or learning plans such as AWS.
- Follow-ups with professors, internships, friends, or collaborators.
- Daily journaling and habit tracking.

## 2. Technology Stack

### 2.1 Current Stack

- Package manager: Bun.
- Frontend framework: React.
- Language: TypeScript.
- Build tool: Vite.
- Styling: plain CSS files scoped by component area.
- Icons: lucide-react.
- Persistence: browser localStorage.
- Portable data: JSON export/import.

### 2.2 Explicitly Avoided

- Tailwind CSS is not used.
- Large monolithic CSS files are avoided.
- The app does not currently use Next.js.
- The app does not currently use a backend service.
- The app does not currently use remote auth or friend sharing.

### 2.3 Current File Organization

Important application files:

- `src/App.tsx`: top-level shell, mode navigation, and view routing.
- `src/types/planner.ts`: core planner data types.
- `src/lib/plannerData.ts`: local data creation, migration, validation, persistence helpers.
- `src/lib/date.ts`: date formatting and calendar helper functions.
- `src/hooks/usePlannerData.ts`: React hook for loading and saving planner data.
- `src/components/DailyView/`: daily execution view.
- `src/components/WeeklyView/`: weekly command-center view.
- `src/components/MonthlyView/`: monthly progress overview.
- `src/components/HabitsView/`: habit tracker.
- `src/components/NotesView/`: journal view, currently still file-named NotesView internally.
- `src/components/DataView/`: JSON export/import and data summary.
- `src/components/ModeTabs/`: left navigation.
- `src/components/DatePicker/`: shared date navigation.
- `src/styles/global.css`: global design primitives and focus styles.

Project-level files:

- `VERSION.txt`: current semantic version.
- `CHANGELOG.txt`: release history.
- `README.md`: basic project summary and commands.
- `docs/PROJECT_BRIEF.md`: concise project brief.
- `docs/ROADMAP.md`: phase roadmap.
- `docs/CONTRIBUTING.md`: commit conventions and versioning notes.

## 3. Versioning and Release State

### 3.1 Versioning Rule

Momentum uses Semantic Versioning.

Version format:

```txt
MAJOR.MINOR.PATCH
```

Meaning:

- Major: breaking or incompatible changes.
- Minor: backward-compatible feature work.
- Patch: backward-compatible fixes.

### 3.2 Current Version

Current version: `0.3.0`.

### 3.3 Version History

#### 0.1.0

Initial app implementation.

Added:

- React, TypeScript, Vite, Bun project setup.
- Daily, Weekly, Habits, Notes, and Data views.
- Local browser persistence.
- JSON export/import.
- Initial project documents.

#### 0.2.0

Planner layout refinement.

Added:

- Monthly view.
- Categorized daily tasks.

Changed:

- Daily task flow became more dynamic.
- Weekly view moved closer to the physical paper planner reference.
- Standalone Notes mode became Journal.
- Daily no longer duplicated the journal panel.
- Wins and blockers were removed from Daily.

#### 0.3.0

Planning model correction.

Added:

- Workflow task statuses: Inbox, Planned, In Progress, Waiting, Done.
- P1-P4 priorities.

Changed:

- Daily view shifted toward execution.
- Weekly view shifted toward command-center planning.
- Monthly view shifted toward progress metrics.
- Header filler copy was removed to preserve screen space.

## 4. Product Principles

### 4.1 Local First

The app stores data on the device using browser localStorage.

Reason:

- It keeps the first version simple.
- It avoids auth and backend complexity.
- It lets the solo planner be built before friend/accountability features.

### 4.2 Portable Data

Data can be exported as JSON and imported on another device.

Reason:

- The user wants a small data file that can be moved between laptops.
- Future file-based sync can build on this.

### 4.3 Solo First

The first phase is for one user only.

Reason:

- Accountability-buddy features are planned, but the solo planner must feel good first.
- Friend sharing before the model is stable would create avoidable complexity.

### 4.4 Practical Planner, Not Marketing Site

Momentum should open directly into the usable planner.

The app should not have:

- A landing page.
- Marketing copy.
- Large hero sections.
- Decorative filler.
- Explanatory text that wastes planner space.

### 4.5 Small Component Files

The codebase should remain readable.

Desired structure:

- Small React components.
- CSS split by component or view.
- No 1000-line stylesheet.
- No large unnecessary abstractions.

## 5. Current Data Model

### 5.1 PlannerData

The top-level saved object contains:

- `version`: data version.
- `daily`: daily entries keyed by date.
- `weekly`: weekly entries keyed by week start date.
- `habits`: habit definitions.
- `habitLogs`: habit completion logs.
- `updatedAt`: last update timestamp.

### 5.2 DailyEntry

A daily entry contains:

- `date`: date key.
- `tasks`: tasks for that day.
- `topFocus`: legacy focus field, now de-emphasized in the UI.
- `note`: journal entry for that day.

The journal remains attached to a day in the data model, even though it is
displayed in the Journal mode rather than inside Daily.

### 5.3 DailyTask

Current task fields:

- `id`: unique task id.
- `title`: task text.
- `status`: workflow state.
- `priority`: priority badge.
- `category`: optional legacy category from earlier versions.

### 5.4 Task Status

Current statuses:

- Inbox.
- Planned.
- In Progress.
- Waiting.
- Done.

These statuses represent workflow state. They are intended to support a Jira or
Trello-like board.

### 5.5 Task Priority

Current priorities:

- P1: critical.
- P2: important.
- P3: normal.
- P4: low.

Priority is separate from status.

This is important because a task can be:

- Waiting and P1.
- In Progress and P3.
- Planned and P2.
- Done and P4.

### 5.6 WeeklyEntry

A weekly entry currently contains:

- `weekStart`: start date of the planning week.
- `topPriorities`: manual critical-goal rows.
- `lowPriorities`: now conceptually used as carry-forward rows.
- `followUps`: now conceptually used as waiting-on rows.
- `notes`: loose weekly notes.

The weekly model is in transition. The user has steered away from static
priority buckets and toward command-center summaries.

### 5.7 Habit

A habit contains:

- `id`: unique id.
- `name`: habit name.
- `color`: visual marker color.
- `createdAt`: date key.
- `archived`: whether the habit is hidden from active tracking.

### 5.8 HabitLog

A habit log contains:

- `habitId`: related habit id.
- `date`: date key.
- `done`: completion state.

## 6. Current Views and Features

## 6.1 App Shell

The app shell provides:

- Brand mark and app name.
- Mode navigation.
- Main workspace area.

Current modes:

- Daily.
- Weekly.
- Monthly.
- Habits.
- Journal.
- Data.

The navigation is icon-based on smaller screens and has labels on larger
screens.

## 6.2 Daily View

### Current Purpose

Daily is becoming the execution surface.

It should answer:

```txt
What am I doing today, what is waiting, and what is done?
```

### Current Implementation

Daily currently includes:

- Date picker.
- Task composer.
- Workflow-status selection.
- Priority selection.
- Add button that is disabled until there is text.
- Task sections by status or execution grouping.
- Animated check completion.
- Editable task titles.
- Task priority badges.
- Task status selectors.
- Task delete action.

### Removed From Daily

The following were removed or de-emphasized:

- Wins.
- Blockers.
- Daily journal panel.
- Filler subheading copy.
- Empty-state text saying: "Add the few things that would make this day count."
- The separate focus side panel.

### Current Problems

The Daily view is still not fully at the desired Trello/Jira level.

The next desired direction is:

```txt
Inbox -> Planned -> Doing -> Waiting -> Done
```

or a software-project style:

```txt
Backlog -> Design -> Build -> Review/UAT -> Done
```

For personal planning, the recommended board is:

```txt
Inbox -> Planned -> Doing -> Waiting -> Done
```

Why:

- It maps to life tasks better than Design/Build/UAT/Prod.
- It makes status drag-and-drop friendly.
- It separates workflow from importance.

### Planned Daily View

Daily should become a compact Kanban board:

```txt
Today
[ quick add input ]

Inbox | Planned | Doing | Waiting | Done
```

Each card should show:

- Task title.
- Priority badge.
- Optional project.
- Optional due date or scheduled time.
- Optional journal/day connection.

Desired card example:

```txt
Planner App redesign
P1
Project: Momentum
Due: Today
```

### Drag and Drop Requirement

The user wants an interaction similar to Jira or Trello:

- Top-level workflow columns.
- Task cards move between columns.
- Dragging a card changes its status.
- Columns represent status, not priority.

Future implementation should use a proven drag-and-drop library instead of
hand-rolling complex drag behavior.

Candidate libraries:

- `@dnd-kit/core` and related dnd-kit packages.
- Pragmatic drag and drop.

dnd-kit is likely a good first choice for React.

## 6.3 Weekly View

### Original Purpose

Weekly began as a digital version of a physical weekly planner reference image.

The physical planner included:

- Weekly focus.
- Top priority.
- To do.
- Low priority.
- Follow up.
- Notes.
- Habit tracker.
- Day boxes for Monday through Sunday.

### Current Direction

The user identified that Weekly should not repeat Daily tasks.

Weekly should become a command center.

It should answer:

```txt
What matters this week?
What is blocked or waiting?
What must carry forward?
How does the week look at a glance?
```

### Current Implementation

Weekly currently includes:

- Date picker.
- Important week-start line.
- Critical Goals.
- Carry Forward.
- Waiting On.
- Task digest areas for critical, waiting, and carry-forward tasks.
- Week day cards that summarize task completion rather than listing all tasks.
- Notes.

### Removed From Weekly

The following were removed:

- Weekly Focus field.
- To Do bucket.
- Filler-style explanatory subheading.

### Why Weekly Changed

The earlier weekly page duplicated task management by showing:

- Top Priority.
- Low Priority.
- Follow Up.
- To Do.

This mixed different concepts:

- Priority.
- Status.
- Follow-up category.
- Task list.

The improved model separates:

- Status as workflow columns.
- Priority as small badges.
- Weekly as planning and summary.

### Planned Weekly View

Future Weekly should become:

```txt
This Week

Critical Goals
---------------
Finish project
GRE practice

Waiting On
----------
Professor reply
Internship response

Carry Forward
-------------
AWS certification

Week Strip
----------
Mon Tue Wed Thu Fri Sat Sun
```

Weekly should aggregate from the real task model instead of keeping too many
manual fields.

## 6.4 Monthly View

### Original Purpose

Monthly was added to show short daily planner previews.

The first idea was:

- Show top 3 or 4 things from each daily planner.
- Provide a short view of each day.

### Problem Identified

Monthly view became redundant if it displayed task titles.

Daily, Weekly, and Monthly would all become task-list views.

### Current Direction

Monthly should answer:

```txt
How did my month go?
```

not:

```txt
What tasks exist?
```

### Current Implementation

Monthly now shows:

- Heading: Monthly View.
- Month being displayed beside the heading.
- Month navigation controls.
- Calendar grid.
- Per-day task count.
- Per-day completed count.
- Completion percentage.
- P1 indicator where applicable.

### Planned Monthly View

Future Monthly should show:

- Completion percentage per day.
- Number of tasks.
- Done ratio.
- Habit completion indicator.
- Streak indicator.
- Click-to-open day.
- Possibly color intensity based on completion.

Example day cell:

```txt
Jun 6
7 tasks
5/7 done
71%
```

## 6.5 Habits View

### Current Purpose

Habits tracks recurring behaviors across a week.

### Current Implementation

Habits includes:

- Add habit form.
- Dynamic habit creation.
- Habit archive/remove action.
- Weekly tracker grid.
- Habit completion toggles for each day.

### User Feedback

The current habit matrix is broadly good.

Suggested future improvements:

- Completion percentage per habit.
- Current streak.
- Longest streak.

Example:

```txt
Workout    ✓ ✓ ✗ ✓ ✓ ✓ ✓    85%
Reading    ✓ ✓ ✓ ✓ ✓ ✓ ✓   100%
```

### Planned Habits View

Future Habit view should include:

- Weekly matrix.
- Completion percentage.
- Current streak.
- Longest streak.
- Maybe monthly habit heatmap.

## 6.6 Journal View

### Current Purpose

Journal is the separate writing surface.

### Important Product Rule

The Journal is attached to days in the data model, but it should not waste space
inside the Daily execution view.

### Current Implementation

Journal includes:

- Date picker.
- Text area for the selected day's entry.
- Recent entries list.

### Planned Journal View

Future Journal should become a timeline:

- Chronological daily entries.
- Filter by date.
- Link to day snapshot.
- Show tasks and habits for that day as context.

Desired day snapshot:

```txt
July 10

Tasks:
- Finished planner UI

Habits:
- Reading ✓
- Workout ✓

Journal:
"Worked on planner app today..."
```

## 6.7 Data View

### Current Purpose

Data provides portability.

### Current Implementation

Data includes:

- Export JSON.
- Import JSON.
- Data summary.
- Last updated timestamp.

### Planned Data View

Future Data view should include:

- Backup/restore.
- Conflict detection.
- Import preview before replacing data.
- Statistics.
- Optional encrypted backup.
- Possibly file-based sync.

## 7. Storage and Migration

### 7.1 Current Storage

Momentum stores data in localStorage under a versioned key.

### 7.2 Data Export

The Data view exports the full planner object as JSON.

### 7.3 Data Import

The Data view imports JSON and validates the shape before replacing local data.

### 7.4 Migration Strategy

The app currently normalizes saved data when loading.

This protects against older local data from earlier versions.

Examples of migration:

- Old task status `open` becomes `planned`.
- Old task status `done` remains `done`.
- Old priority `high` becomes `P1`.
- Old priority `medium` becomes `P3`.
- Old priority `low` becomes `P4`.
- Old category values are kept only as optional legacy data.

## 8. Design Decisions

### 8.1 Screen Real Estate

The user explicitly requested removal of filler copy.

Removed or reduced:

- Daily helper text.
- Monthly helper text.
- Habits helper text.
- Journal helper text.
- Data helper text.
- Empty state helper text in Daily.

Reason:

- The app is a tool.
- Repeated explanatory text wastes space.
- The interface should be obvious through structure.

### 8.2 Focus Styling

Default browser blue focus outlines were considered ugly and inconsistent.

The app now uses a custom focus-visible style:

- No default blue outline.
- App-colored border.
- Muted green focus ring.

### 8.3 Completion Interaction

Daily task completion should feel satisfying.

Implemented direction:

- Check button changes visual state.
- Task text fades to lighter black.
- Strike-through animation is represented through CSS.

### 8.4 Paper Planner Influence

The weekly planner image influenced:

- Weekly view layout.
- Priority blocks.
- Follow-up concept.
- Day-by-day week overview.
- Habit tracker idea.

Later changes reduced direct paper imitation where it caused redundancy.

## 9. Current Architectural Tension

### 9.1 Problem

The app was initially built as separate views:

```txt
Daily View
Weekly View
Monthly View
```

This created redundancy because each view could become another way to show
tasks.

### 9.2 Better Architecture

The better architecture is:

```txt
Planner
├── Dashboard
├── Tasks
├── Calendar
├── Habits
├── Journal
└── Data
```

Then Calendar can contain:

```txt
Day
Week
Month
```

### 9.3 Recommended Core

The strongest future model is:

```txt
Projects -> Tasks -> Calendar Views
```

Reason:

- Projects represent long-running efforts.
- Tasks represent one-time actions.
- Calendar views show scheduled or dated work.
- Habits remain recurring behavior.
- Journal remains reflection.

## 10. Future Roadmap

### 10.1 Near-Term Priority

Build a real Kanban task board.

Recommended columns:

```txt
Inbox -> Planned -> Doing -> Waiting -> Done
```

This can be inside Daily first, or as a separate Tasks mode.

### 10.2 Tasks Mode

Future Tasks mode should include:

- Kanban board.
- Drag-and-drop cards.
- Status columns.
- Priority badges.
- Optional project field.
- Optional due date.
- Optional scheduled date.
- Optional recurrence later.

### 10.3 Projects

Future Projects should include:

- Project name.
- Project description.
- Project status.
- Related tasks.
- Progress summary.

Example:

```txt
Project: Planner App

Tasks:
✓ Design DB
✓ Build Daily View
□ Build Habit View
□ Add Export Feature
```

### 10.4 Calendar Mode

Calendar should eventually contain:

- Day.
- Week.
- Month.

These should be lenses on scheduled tasks and daily data.

### 10.5 Dashboard

Future Dashboard should summarize:

- Today's tasks.
- Habit progress.
- Weekly goals.
- Waiting items.
- Recent journal entries.

### 10.6 Accountability Buddy

Future accountability features should include:

- Share read-only planner summaries.
- Friend check-ins.
- Weekly review summaries.
- Optional buddy-facing progress snapshot.

This should come after the solo model is stable.

### 10.7 Better Portability

Future portability could include:

- File-based JSON sync.
- Import conflict handling.
- Backup history.
- Encrypted export.
- Eventually a small backend if needed.

### 10.8 Possible Backend Direction

Potential backend/storage options:

- Continue local-first JSON.
- SQLite-backed desktop wrapper.
- Supabase.
- Small custom API.

Backend should not be added until the local-first data model feels right.

## 11. Open Product Questions

### 11.1 Should Tasks Become Their Own Mode?

The user has strongly suggested:

```txt
Dashboard
Tasks
Calendar
Habits
Journal
Data
```

This would make Daily/Weekly/Monthly subviews of Calendar.

### 11.2 Should Daily Be a Board or a Day Lens?

Two possible directions:

Option A:

Daily is a Kanban board for tasks relevant today.

Option B:

Tasks mode owns the Kanban board, and Daily shows only tasks scheduled today.

Recommended:

- Build the Kanban board first.
- Then decide whether it belongs under Daily or Tasks.

### 11.3 What Workflow Columns Should Be Used?

Options:

Personal workflow:

```txt
Inbox -> Planned -> Doing -> Waiting -> Done
```

Project workflow:

```txt
Backlog -> Design -> Build -> Review/UAT -> Done
```

Recommended for Momentum:

```txt
Inbox -> Planned -> Doing -> Waiting -> Done
```

Reason:

- More general.
- Better for college/life tasks.
- Still compatible with software-project work.

### 11.4 Should Journal Stay Separate?

Current answer:

- Yes, as a separate mode.
- But data remains attached to days.

### 11.5 Should Habits Be Linked to Monthly?

Future answer:

- Yes.
- Monthly should eventually show habit streaks or completion signals.

## 12. Implementation Notes for Future Work

### 12.1 Kanban Implementation

Recommended steps:

1. Add a reusable `TaskCard` component.
2. Add a reusable `TaskColumn` component.
3. Add a `TaskBoard` component.
4. Use status columns from the data model.
5. Add drag-and-drop with a proven library.
6. Update task status on drop.
7. Keep priority as a badge, not a column.

### 12.2 Data Model Evolution

Future task fields likely needed:

- `projectId`.
- `scheduledDate`.
- `dueDate`.
- `createdAt`.
- `updatedAt`.
- `description`.
- `estimate`.
- `tags`.

Future project fields likely needed:

- `id`.
- `name`.
- `status`.
- `description`.
- `createdAt`.
- `archived`.

### 12.3 UI Naming

Current names:

- Daily.
- Weekly.
- Monthly.
- Habits.
- Journal.
- Data.

Possible future names:

- Dashboard.
- Tasks.
- Calendar.
- Habits.
- Journal.
- Data.

### 12.4 Documentation Maintenance

When features change:

- Update `CHANGELOG.txt`.
- Update `VERSION.txt` when releasing.
- Update roadmap and product docs when direction changes.
- Keep user constraints documented.


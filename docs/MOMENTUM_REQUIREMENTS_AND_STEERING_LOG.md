# Momentum Requirements and Steering Log

## 1. Purpose of This Document

This document records the requirements, constraints, preferences, and steering
decisions provided during the Momentum planning app conversation.

It is intentionally detailed. Its purpose is to preserve not just what was
built, but why the product moved in each direction.

## 2. Original App Idea

The user wanted a simple React app for planning purposes.

The initial inspiration was a physical weekly planner image located at:

```txt
/Users/ananth/Downloads/weekly planner.jpg
```

The planner image included a weekly layout with:

- Weekly plan title.
- Weekly focus.
- Top priority.
- To do.
- Low priority.
- Follow up.
- Notes.
- Habit tracker.
- Day sections for Monday through Sunday.

The user wanted a basic digital version but was open to improving the concept.

## 3. Original Product Goals

The user described the purpose as:

- Accountability.
- Tracking planning.
- Getting into journaling.
- Supporting daily notes.
- Supporting habits.
- Potentially supporting an accountability buddy in the future.

The user has a friend who currently uses the physical version of the planner.

Future possibility:

- Add friends.
- Show planner to friend.
- Track friend progress.
- Build accountability-buddy features.

## 4. Initial Feature Requirements

### 4.1 Modes

Initial desired modes included:

- Daily view.
- Weekly view.
- Monthly view.
- Goals or long-term view.
- Daily notes.

The user emphasized:

- Daily view should have tasks.
- Weekly view should be broader, not just a copy of Daily.
- Habits should be dynamic.
- The user should be able to add habits from the frontend.

### 4.2 Data Storage

Initial storage preference:

- Local storage for now.
- Data should also be portable as a small file.
- The file should be movable between laptops.
- Importing the file should restore data.

The user accepted that this was negotiable, but local-first was chosen for the
first version.

### 4.3 Friend Features

Friend/accountability features were explicitly considered future phase.

Chosen direction:

- Build a solid solo app first.
- Add accountability sharing later.

## 5. Technical Constraints Provided by the User

### 5.1 Package Manager

Use Bun.

### 5.2 Framework

Use React with TypeScript and Vite.

The user referred to:

```txt
reactvitetsx
```

The selected stack became:

```txt
Bun + React + TypeScript + Vite
```

### 5.3 Styling

The user explicitly said:

- Do not use Tailwind at all.
- Create small readable componentized files.
- Create structured CSS files for each component.
- Do not lump CSS into huge 1000+ line files.

### 5.4 Versioning

Use Semantic Versioning.

The user referenced:

```txt
https://semver.org/
```

Required files:

- `VERSION.txt`: only has the version.
- `CHANGELOG.txt`: changes in industry-standard format.

### 5.5 Commit Strategy

The user requested a conventional commit strategy.

Commit types provided:

- `feat`: new feature.
- `fix`: bug fix.
- `docs`: documentation only.
- `style`: formatting or whitespace without behavior change.
- `refactor`: restructuring without behavior change.
- `perf`: performance improvement.
- `test`: tests.
- `build`: build system or dependency changes.
- `ci`: CI/CD configuration.
- `chore`: miscellaneous maintenance.
- `revert`: revert previous commit.

### 5.6 Repository Location

The user wanted the project under:

```txt
/Users/ananth/Documents/Codeberg/momentum
```

The user's local folder organization:

- `Documents/non-git-code`: should not touch GitHub or remotes.
- `Documents/GitHub`: GitHub repositories.
- `Documents/Codeberg`: intended for Codeberg repositories.

### 5.7 Remote Strategy

The user wanted the project to go to Codeberg only at first.

Possible remote:

```txt
https://codeberg.org/mavenrank/momentum.git
```

The user also wanted to understand future dual-remote pushing to both GitHub and
Codeberg.

No git initialization or remote push was performed as part of the implementation
work unless explicitly requested later.

## 6. Initial Implementation Created

The first implementation created:

- React Vite TypeScript app.
- Bun package configuration.
- Daily view.
- Weekly view.
- Habits view.
- Notes view.
- Data view.
- localStorage persistence.
- JSON export/import.
- Version and changelog files.
- Documentation files.
- Component CSS files.

Initial views:

- Daily: tasks, focus, blockers, wins, daily note.
- Weekly: theme, focus areas, commitments, reflection, week overview.
- Habits: dynamic habit creation and weekly tracker.
- Notes: daily note editor and recent notes.
- Data: export/import JSON.

## 7. First Major Steering: Paper Planner Feel and Monthly View

The user then asked for:

- A monthly view.
- Monthly should show top 3 or 4 things from the daily planner.
- Weekly should look more like the paper planner.
- Weekly should not show all empty fields.
- Fields should appear progressively only after the user types.
- Fix a tiny height/scroll issue in Weekly.

### 7.1 Daily View Steering

The user said Daily should change:

- Remove wins completely.
- Replace wins with satisfying task completion.
- Completion should animate smoothly.
- Checked tasks should cross off left to right.
- Text should fade to lighter black.
- Use a black strikethrough.
- Blockers are not important.
- Accountability section makes little sense.
- Daily note duplicates Notes view.
- Rename Daily Note to Journal.

### 7.2 Daily Task Composer Requirement

The user requested:

- Remove static Add button.
- Add placeholder textarea.
- Add button beside it should be disabled until text exists.
- When typed, enable Add.
- Pressing Add creates task.
- Tasks should be numbered in small mono font.
- Task list height should be dynamic.

### 7.3 Resulting Changes

Implemented direction:

- Added Monthly view.
- Reworked Weekly toward paper-planner layout.
- Added progressive fields in Weekly.
- Removed wins and blockers.
- Added animated task completion.
- Added dynamic task composer.
- Renamed standalone Notes mode later to Journal.
- Removed Daily journal panel after clarification.

## 8. Clarification: Journal Belongs as Separate Mode

The user clarified:

```txt
i meant that jounral inside of daily plan is not necessary
cuz there is a habit view already -> rename THAT to journal
```

Interpretation:

- Daily should not contain Journal.
- The separate Notes mode should be renamed Journal.
- Journal data can still be attached to days internally.

Implemented:

- Removed Journal panel from Daily.
- Renamed user-facing Notes mode to Journal.
- Kept the daily `note` field for data continuity.

## 9. Second Major Steering: Remove Wasted Screen Real Estate

The user requested removal of filler text.

### 9.1 Monthly

Original monthly helper text:

```txt
Short daily previews from your planner, limited to the top few items.
```

User requested removal.

Additional monthly request:

- Shorten text under heading.
- Push that text beside "Monthly View".
- Display the month being shown.

Implemented:

- Removed filler sentence.
- Displayed month beside heading.
- Monthly cells now show metrics.

### 9.2 Daily

User requested:

- Remove empty state text:

```txt
Add the few things that would make this day count.
```

- Remove focus thing completely.
- Expand tasks to occupy entire space to the right.
- Remove Daily helper text:

```txt
Capture the day, add what matters, and cross things off cleanly.
```

Implemented:

- Removed helper text.
- Removed empty state copy.
- Removed focus side panel.
- Expanded task area.

### 9.3 Habits

Remove:

```txt
Create habits from the app and mark them across the current week.
```

Implemented.

### 9.4 Journal

Remove:

```txt
One entry per day, separate from the daily planning surface.
```

Implemented.

### 9.5 Data

Remove:

```txt
Keep Momentum local and portable with a small JSON backup file.
```

Implemented.

### 9.6 Reason

The user said not to waste valuable screen real estate with helper text.

## 10. Third Major Steering: Planning Model Was Wrong

The user identified a deeper issue:

```txt
You have designed views first, but not the underlying planning model.
```

The user observed:

- Daily View = Tasks.
- Weekly View = Tasks again.
- Monthly View = Tasks again.

This made the views redundant.

## 11. Architecture Proposed by the User

The user suggested separating Task Management from Calendar.

Instead of:

```txt
Daily View
Weekly View
Monthly View
```

Think:

```txt
Planner
├── Tasks
├── Calendar
├── Habits
├── Journal
└── Data
```

Calendar then has:

```txt
Day
Week
Month
```

This makes Day, Week, and Month views lenses on scheduled work rather than
separate task systems.

## 12. Tags Were Mixing Concepts

The user pointed out that earlier categories mixed dimensions:

- Top Priority.
- Low Priority.
- Follow Up.
- Todo.

Example:

```txt
Call Professor
```

This task could be:

- High Priority.
- Follow-up.
- Todo.

all at once.

Therefore, those labels should not be mutually exclusive columns.

## 13. Better Task System Proposed by User

The user proposed:

### 13.1 Status

Status should be drag-and-drop Jira style.

Proposed statuses:

```txt
Inbox
Planned
In Progress
Waiting
Done
```

Example:

```txt
Inbox
├─ Check GRE dates
├─ Look at internship

Planned
├─ Complete Assignment

In Progress
├─ Planner App

Waiting
├─ Professor reply

Done
├─ Finished AWS module
```

### 13.2 Priority

Priority should be a small badge:

```txt
P1 - Critical
P2 - Important
P3 - Normal
P4 - Low
```

Example:

```txt
[In Progress] Planner App     P1
[Planned] GRE Research        P2
[Waiting] Professor Reply     P3
```

### 13.3 Implemented Model Change

The app data model was changed toward:

- Status as workflow.
- Priority as badge.
- Legacy category optional.

## 14. Weekly View Steering

The user said Weekly should not repeat tasks.

The earlier Weekly duplicated task information:

```txt
Weekly View
├─ Top Priority
├─ Low Priority
├─ Follow Up
└─ Todo
```

The user proposed:

```txt
Weekly Command Center
```

Left panel:

```txt
This Week

Critical Goals
─────────────
□ Finish Project
□ GRE Practice

Waiting On
──────────
□ Professor reply
□ Internship response

Carry Forward
─────────────
□ AWS Certification
```

Right panel:

```txt
Mon Tue Wed Thu Fri Sat Sun
```

Implemented direction:

- Removed Weekly Focus field.
- Removed To Do portion.
- Made week-start line more prominent.
- Added Critical Goals, Waiting On, Carry Forward direction.
- Weekly day cards summarize task counts rather than repeating full task lists.

## 15. Daily View Steering

The user said Daily should be execution-oriented.

Example:

```txt
Today
────────────────

Top 3 Focus
□ Finish Assignment
□ Planner Development
□ IELTS Practice

Scheduled
09:00 Class
14:00 Project Work

Other Tasks
□ Buy groceries
□ Call friend

Journal
────────
...
```

Later, the user clarified that a Trello/Jira-style task board would be better.

Current direction:

- Daily should be an execution board.
- Tasks should move between status columns.
- Journal should remain separate.

## 16. Monthly View Steering

The user realized Monthly should have a different purpose.

Monthly should answer:

```txt
How did my month go?
```

not:

```txt
What tasks exist?
```

Proposed Monthly:

- Calendar grid.
- Each day shows task count.
- Completed count.
- Percentage.
- Habit streak indicators.

Implemented direction:

- Monthly now displays completion metrics rather than task title previews.

## 17. Habit View Steering

The user said current habit matrix was good.

Proposed improvements:

```txt
Habit | Mon Tue Wed Thu Fri Sat Sun | %
```

Example:

```txt
Workout    ✓ ✓ ✗ ✓ ✓ ✓ ✓    85%
Reading    ✓ ✓ ✓ ✓ ✓ ✓ ✓   100%
```

Additional desired metrics:

- Current streak.
- Longest streak.

These are planned future improvements.

## 18. Journal Steering

The user wants Journal connected to days.

Every day should eventually become a life snapshot:

```txt
Day
├─ Tasks
├─ Habits
└─ Journal
```

Example:

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

Current implementation:

- Journal is separate mode.
- Journal entries are still attached to day entries.

## 19. Desired Future Navigation

The user proposed:

```txt
Dashboard
Tasks
Calendar
Habits
Journal
Data
```

This is not fully implemented yet.

Current navigation remains:

```txt
Daily
Weekly
Monthly
Habits
Journal
Data
```

Future direction:

- Add Tasks mode.
- Add Dashboard mode.
- Possibly combine Day/Week/Month under Calendar.

## 20. Desired Dashboard

The user suggested:

```txt
Dashboard

Today's Tasks
Habit Progress
Weekly Goals
Recent Journal
```

This is planned but not yet implemented.

## 21. Desired Tasks Mode

The user suggested:

```txt
Tasks

Kanban Board

Inbox
Planned
In Progress
Waiting
Done
```

This is the most important next architectural feature.

## 22. Desired Calendar Mode

The user suggested:

```txt
Calendar

Day
Week
Month
```

These should be views of the same scheduled tasks rather than separate
task-management systems.

## 23. Desired Projects and Goals Layer

The user proposed distinguishing:

### Tasks

One-time actions:

```txt
Submit assignment
Call professor
Buy SSD
```

### Goals / Projects

Long-running things:

```txt
Planner App
GRE Preparation
Movie Recommendation System
AWS Learning
```

Tasks can belong to a project.

Example:

```txt
Project: Planner App

Tasks:
✓ Design DB
✓ Build Daily View
□ Build Habit View
□ Add Export Feature
```

The user said this change usually makes personal planners more useful because
long-term efforts stop getting mixed with tiny one-off todos.

## 24. Jira/Trello Steering

The user later asked for a Jira/Trello-like task experience:

```txt
yknow the jira top level elements and then we drag the tasks/epics from one field to the other
from desigb -> build-> uat -> prod (example)
```

The answer recommended:

For personal planning:

```txt
Inbox -> Planned -> Doing -> Waiting -> Done
```

For software-project style:

```txt
Backlog -> Design -> Build -> Review/UAT -> Done
```

Recommended for Momentum:

```txt
Inbox -> Planned -> Doing -> Waiting -> Done
```

Reason:

- More natural for personal tasks.
- Still supports project work.
- Avoids using "Prod" for everyday life tasks.

## 25. Current Implemented Features Summary

### 25.1 Built

- Vite React TypeScript app using Bun.
- Componentized CSS.
- Local-first persistence.
- JSON export/import.
- Daily planner.
- Weekly planner.
- Monthly view.
- Habits tracker.
- Journal.
- Data view.
- Version and changelog files.
- Documentation files.

### 25.2 Changed

- Notes mode renamed Journal.
- Daily journal panel removed.
- Wins and blockers removed.
- Daily focus side panel removed.
- Header helper copy removed.
- Monthly changed from task previews to metrics.
- Weekly changed from paper fields toward command center.
- Task model changed from category-oriented to status + priority.

### 25.3 Still Planned

- Proper Kanban board with drag-and-drop.
- Tasks mode.
- Calendar mode with Day/Week/Month.
- Dashboard.
- Projects/goals layer.
- Habit percentages and streaks.
- Better data sync.
- Accountability-buddy features.

## 26. Constraints That Must Continue To Be Honored

### 26.1 Technical

- Use Bun.
- Use React.
- Use TypeScript.
- Use Vite.
- Do not use Tailwind.
- Keep CSS files structured and component-focused.
- Keep files readable.
- Maintain Semantic Versioning.
- Maintain `VERSION.txt`.
- Maintain `CHANGELOG.txt`.

### 26.2 Product

- Local-first first.
- Portable JSON data.
- Solo planner first.
- Friend/accountability features later.
- Avoid wasted copy.
- Avoid redundant views.
- Separate task status from priority.
- Treat Day/Week/Month as calendar lenses over the same work.
- Eventually separate Projects from Tasks.

### 26.3 Design

- Planner should feel practical.
- Avoid marketing-page patterns.
- Avoid filler text.
- Focus states should match app styling, not default blue outlines.
- Daily completion should feel satisfying.
- Monthly should summarize progress.
- Weekly should guide planning and review, not duplicate task entry.

## 27. Recommended Next Implementation Order

### Step 1: Build Real Task Board

Create a reusable Kanban board:

- `TaskBoard`.
- `TaskColumn`.
- `TaskCard`.

Columns:

```txt
Inbox
Planned
Doing
Waiting
Done
```

Use drag-and-drop to move cards.

### Step 2: Add Projects

Add project data model:

- Project id.
- Project name.
- Description.
- Status.
- Archived flag.

Allow tasks to belong to projects.

### Step 3: Restructure Navigation

Move toward:

```txt
Dashboard
Tasks
Calendar
Habits
Journal
Data
```

### Step 4: Convert Daily/Weekly/Monthly Into Calendar Views

Calendar should contain:

- Day.
- Week.
- Month.

### Step 5: Add Habit Metrics

Add:

- Weekly percentage.
- Current streak.
- Longest streak.

### Step 6: Add Dashboard

Dashboard should summarize:

- Today's tasks.
- Habit progress.
- Weekly critical goals.
- Waiting items.
- Recent journal.

### Step 7: Improve Portability

Add:

- Import preview.
- Conflict detection.
- Backup history.
- Optional encrypted export.

### Step 8: Accountability Buddy

Add only after solo planner is strong:

- Share summaries.
- Buddy check-ins.
- Read-only friend view.
- Weekly accountability recap.

## 28. Summary of Product Direction

Momentum started as a digital weekly planner inspired by a physical paper page.

It is now evolving into a local-first personal operating system with:

- Tasks as workflow items.
- Priorities as badges.
- Projects as long-running containers.
- Calendar views as lenses.
- Habits as recurring behavior.
- Journal as daily reflection.
- Data tools for portability.

The most important correction is this:

```txt
Do not build views first.
Build the planning model first.
```

The intended future architecture is:

```txt
Projects -> Tasks -> Calendar Views
```

with:

```txt
Dashboard
Tasks
Calendar
Habits
Journal
Data
```

as the eventual navigation structure.


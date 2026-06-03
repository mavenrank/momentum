# Momentum — Personal Planner

A minimal, printable-style weekly planner app for personal accountability,
habit tracking, and journaling.

## Tech Stack

| Layer | Choice |
|--- |--- |
| Runtime | Bun 1.x |
| Framework | React 19 + Vite 8 + TypeScript 6 |
| State | Zustand 5 (persisted to localStorage) |
| Routing | React Router v7 |
| Date utils | date-fns 4 |
| Icons | lucide-react |
| Font | Geist Variable (via @fontsource-variable) |
| Styling | Plain CSS (1 file per feature area) |
| Storage | localStorage + JSON export/import |

## Views

- **Daily** — tasks, habit check-in, journal entry
- **Weekly** — full printable-style spread (priorities, todo, notes, habit
  tracker, day schedule grid)
- **Monthly** — calendar with task previews
- **Goals & Habits** — long-term goals with progress, habit CRUD

## Project Structure

```
momentum/
├── docs/
│   ├── ROADMAP.md           # Versioned future plans
│   └── ARCHITECTURE.md      # This file
├── src/
│   ├── components/
│   │   ├── layout/          # AppShell, Sidebar
│   │   ├── daily/           # DailyView
│   │   ├── weekly/          # WeeklyView
│   │   ├── monthly/         # MonthlyView
│   │   ├── goals/           # GoalsView
│   │   └── settings/        # DataSettings (export/import)
│   ├── store/               # Zustand stores (task, habit, note, goal, weekly)
│   ├── types/               # TypeScript interfaces
│   ├── utils/               # date, id, export, storage helpers
│   └── styles/              # Per-feature CSS files
├── VERSION.txt              # Current version
└── CHANGELOG.txt            # Release notes
```

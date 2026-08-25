from __future__ import annotations

import random
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Iterable


DEFAULT_AREAS = [
    "College",
    "Work",
    "Projects",
    "Health",
    "Personal",
    "Finance",
    "Relationships",
]
CUSTOM_AREAS = ["Garden", "Home", "Learning", "Community", "Travel", "Creative"]
PRIORITIES = [None, None, "must", "should", "could", "want"]
DURATIONS = [15, 30, 45, 60, 90, 120]
TASK_NOUNS = [
    "review",
    "planning session",
    "deep work",
    "phone call",
    "research",
    "errand",
    "workout",
    "reading",
    "maintenance",
    "writing block",
    "admin pass",
    "check-in",
]
TASK_OBJECTS = [
    "quarterly goals",
    "project notes",
    "budget",
    "course material",
    "home inventory",
    "training plan",
    "travel details",
    "client feedback",
    "garden schedule",
    "weekly backlog",
    "family plans",
    "design ideas",
]


def _date_range(start: date, days: int) -> list[date]:
    return [start + timedelta(days=offset) for offset in range(days)]


def _clock(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


class IntervalAllocator:
    """Deterministic per-day allocator for non-overlapping half-open intervals."""

    def __init__(self, rng: random.Random) -> None:
        self.rng = rng
        self.occupied: dict[str, list[tuple[int, int]]] = defaultdict(list)

    def allocate(self, day: str) -> str | None:
        for _ in range(200):
            duration = self.rng.choice(DURATIONS)
            latest_start = 22 * 60 - duration
            start = self.rng.randrange(6 * 60, latest_start + 1, 15)
            end = start + duration
            if all(start >= other_end or other_start >= end for other_start, other_end in self.occupied[day]):
                self.occupied[day].append((start, end))
                return f"{_clock(start)}-{_clock(end)}"
        return None


def area_commands() -> list[dict[str, Any]]:
    return [
        {"type": "area.create", "name": name}
        for name in CUSTOM_AREAS
    ]


def task_commands(
    *,
    count: int,
    seed: int,
    year: int,
    today: date = date(2026, 8, 25),
) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    days = _date_range(date(year, 1, 1), 365 + int(year % 4 == 0))
    allocator = IntervalAllocator(rng)
    areas = DEFAULT_AREAS + CUSTOM_AREAS
    commands: list[dict[str, Any]] = []

    for index in range(count):
        title = f"{rng.choice(TASK_NOUNS).title()}: {rng.choice(TASK_OBJECTS)} [{index + 1:04d}]"
        input_data: dict[str, Any] = {
            "title": title,
            "area": rng.choice(areas),
        }
        priority = rng.choice(PRIORITIES)
        if priority:
            input_data["priority"] = priority
        if rng.random() < 0.24:
            input_data["summary"] = f"Generated scenario {index + 1} from seed {seed}."
        if rng.random() < 0.08:
            input_data["description"] = (
                "A deliberately longer generated description used to exercise "
                "detail views, wrapping, persistence, and export behavior."
            )

        unscheduled_roll = rng.random()
        if unscheduled_roll < 0.12:
            input_data["status"] = "pool"
        elif unscheduled_roll < 0.20:
            input_data["status"] = "planned"
        else:
            scheduled = rng.choice(days)
            scheduled_key = scheduled.isoformat()
            input_data["scheduledDate"] = scheduled_key

            # Historical unfinished work would be auto-collected by the web app.
            # Mark it done so the generated year remains visible after import.
            if scheduled < today - timedelta(days=1):
                input_data["status"] = "done"
            else:
                input_data["status"] = rng.choice(
                    ["scheduled", "scheduled", "scheduled", "doing", "waiting", "done"]
                )

            timing_roll = rng.random()
            if timing_roll < 0.62:
                allocated = allocator.allocate(scheduled_key)
                if allocated:
                    input_data["timeOfDay"] = allocated
            elif timing_roll < 0.74:
                input_data["allDay"] = True

        commands.append(
            {
                "type": "task.create",
                "input": input_data,
                "conflictPolicy": "reject",
            }
        )

    return commands


def journal_and_week_commands(
    *,
    year: int,
    seed: int,
    task_ids: list[str],
) -> list[dict[str, Any]]:
    rng = random.Random(seed ^ 0x5A17)
    days = _date_range(date(year, 1, 1), 365 + int(year % 4 == 0))
    commands: list[dict[str, Any]] = []

    for index, day in enumerate(days):
        references = rng.sample(task_ids, k=min(len(task_ids), rng.choice([0, 0, 1, 1, 2])))
        mention_text = " ".join(f"@{task_id}" for task_id in references)
        commands.append(
            {
                "type": "journal.set",
                "date": day.isoformat(),
                "note": (
                    f"Day {index + 1}: reflected on progress, energy, and the next useful step. "
                    f"{mention_text}"
                ).strip(),
            }
        )

    first = date(year, 1, 1)
    monday = first - timedelta(days=first.weekday())
    while monday.year <= year:
        commands.append(
            {
                "type": "weekly.set",
                "weekStart": monday.isoformat(),
                "notes": f"Weekly review for {monday.isoformat()}: wins, risks, and next commitments.",
            }
        )
        monday += timedelta(days=7)

    return commands


def habit_create_commands() -> list[dict[str, Any]]:
    return [
        {"type": "habit.create", "name": name, "createdDate": "2026-01-01"}
        for name in ["Exercise", "Read", "Meditate", "Plan tomorrow", "Drink water", "No screens late"]
    ]


def habit_log_commands(
    habit_ids: Iterable[str],
    *,
    year: int,
    seed: int,
) -> list[dict[str, Any]]:
    rng = random.Random(seed ^ 0xCAFE)
    days = _date_range(date(year, 1, 1), 365 + int(year % 4 == 0))
    commands: list[dict[str, Any]] = []
    for habit_id in habit_ids:
        for day in days:
            if rng.random() < 0.58:
                commands.append({"type": "habit.toggle", "habitId": habit_id, "date": day.isoformat()})
    return commands

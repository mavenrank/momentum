from __future__ import annotations

import argparse
import json
from pathlib import Path

if __package__:
    from .dataset import (
        area_commands,
        habit_create_commands,
        habit_log_commands,
        journal_and_week_commands,
        task_commands,
    )
    from .harness import MomentumCli
else:
    from dataset import (
        area_commands,
        habit_create_commands,
        habit_log_commands,
        journal_and_week_commands,
        task_commands,
    )
    from harness import MomentumCli


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a replayable Momentum year dataset")
    parser.add_argument("--data", type=Path, required=True, help="Target CLI store path")
    parser.add_argument("--count", type=int, default=1200)
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--seed", type=int, default=20260825)
    parser.add_argument("--export", type=Path, help="Optional web-importable JSON output")
    parser.add_argument("--append", action="store_true", help="Allow adding to an existing store")
    args = parser.parse_args()

    if args.data.exists() and not args.append:
        parser.error(f"{args.data} already exists; use a new path or pass --append")

    cli = MomentumCli(args.data)
    cli.batch(area_commands() + task_commands(count=args.count, seed=args.seed, year=args.year))
    data = cli.inspect()
    task_ids = [task["id"] for entry in data["daily"].values() for task in entry["tasks"]]

    cli.batch(habit_create_commands())
    data = cli.inspect()
    generated_habits = [
        habit["id"]
        for habit in data["habits"]
        if habit["name"] not in {"Plan the day", "Journal"}
    ]

    cli.batch(
        journal_and_week_commands(year=args.year, seed=args.seed, task_ids=task_ids)
        + habit_log_commands(generated_habits, year=args.year, seed=args.seed)
    )
    report = cli.validate()
    status = cli.run("status")["result"]

    if args.export:
        cli.run("export", "--out", str(args.export))

    print(json.dumps({"seed": args.seed, "validation": report, "status": status}, indent=2))


if __name__ == "__main__":
    main()

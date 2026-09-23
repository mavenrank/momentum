from __future__ import annotations

import concurrent.futures
import random
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from dataset import (
    area_commands,
    habit_create_commands,
    habit_log_commands,
    journal_and_week_commands,
    task_commands,
)
from harness import MomentumCli


class MomentumApplicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="momentum-application-")
        self.addCleanup(self.temporary.cleanup)
        self.data_path = Path(self.temporary.name) / "store.json"
        self.cli = MomentumCli(self.data_path)

    def test_conflicts_revisions_idempotency_and_dry_run(self) -> None:
        first = self.cli.run(
            "createtask",
            "Focus block 26-8-2026 9am-10am must #work",
            "--idempotency-key",
            "create-focus",
        )
        task_id = first["result"]["id"]
        self.assertEqual(first["revision"], 1)

        replay = self.cli.run(
            "createtask",
            "Focus block 26-8-2026 9am-10am must #work",
            "--idempotency-key",
            "create-focus",
        )
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["revision"], 1)

        conflict = self.cli.run(
            "createtask",
            "Collision 26-8-2026 9:30am-10:30am",
            expect_ok=False,
        )
        self.assertEqual(conflict["error"]["code"], "TIME_CONFLICT")
        self.assertIn(task_id, conflict["error"]["details"])

        stale = self.cli.run(
            "task",
            "complete",
            task_id,
            "--expected-revision",
            "0",
            expect_ok=False,
        )
        self.assertEqual(stale["error"]["code"], "STALE_REVISION")

        dry = self.cli.run(
            "createtask",
            "Dry run tomorrow 3pm",
            "--dry-run",
        )
        self.assertTrue(dry["dryRun"])
        self.assertEqual(dry["revision"], 1)
        self.assertEqual(self.cli.run("status")["result"]["tasks"], 1)

    def test_dataset_generator_is_module_invocable(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "tests.application.generate_year_dataset", "--help"],
            cwd=Path(__file__).resolve().parents[2],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Generate a replayable Momentum year dataset", result.stdout)

    def test_area_and_pursuit_lifecycle_through_cli(self) -> None:
        area = self.cli.run("area", "create", "Research", "--domain", "Work")["result"]
        pursuit = self.cli.run("pursuit", "create", "Dissertation", "--area", area["id"])["result"]
        task = self.cli.run("task", "create", "Draft proposal", "--pursuit", pursuit["id"])["result"]
        self.assertEqual(task["area"], area["id"])
        self.assertEqual(task["pursuitId"], pursuit["id"])
        personal_area = self.cli.run("area", "create", "Research", "--domain", "Personal")["result"]
        mismatch = self.cli.run("task", "create", "Personal stream", "--area", personal_area["id"], "--pursuit", pursuit["id"], expect_ok=False)
        self.assertEqual(mismatch["error"]["code"], "AREA_PURSUIT_MISMATCH")
        self.cli.run("pursuit", "areas", pursuit["id"], "--areas", personal_area["id"])
        personal_task = self.cli.run("task", "create", "Personal stream", "--area", personal_area["id"], "--pursuit", pursuit["id"])["result"]
        self.cli.run("task", "update", task["id"], "--related-areas", personal_area["id"])
        self.assertEqual(len(self.cli.run("area", "tasks", "Personal / Research")["result"]), 2)
        self.assertEqual(len(self.cli.run("area", "tasks", "Personal / Research", "--primary-only")["result"]), 1)

        self.cli.run("area", "rename", area["id"], "--name", "Scholarship")
        self.assertEqual(self.cli.run("area", "tasks", "Scholarship")["result"][0]["id"], task["id"])
        self.cli.run("area", "archive", area["id"])
        rejected = self.cli.run("task", "create", "New research #Scholarship", expect_ok=False)
        self.assertEqual(rejected["error"]["code"], "AREA_ARCHIVED")
        self.cli.run("area", "restore", area["id"])

        self.cli.run("pursuit", "pause", pursuit["id"])
        rejected = self.cli.run("task", "create", "Second draft", "--pursuit", pursuit["id"], expect_ok=False)
        self.assertEqual(rejected["error"]["code"], "PURSUIT_INACTIVE")
        self.cli.run("task", "complete", task["id"])
        self.cli.run("task", "complete", personal_task["id"])
        self.cli.run("pursuit", "complete", pursuit["id"])
        self.assertEqual(len(self.cli.run("pursuit", "tasks", pursuit["id"])["result"]), 2)
        self.assertTrue(self.cli.validate()["valid"])

    def test_cross_process_lock_keeps_ids_unique(self) -> None:
        def create(index: int) -> dict:
            local = MomentumCli(self.data_path)
            return local.run(
                "createtask",
                f"Concurrent task {index}",
                "--idempotency-key",
                f"concurrent-{index}",
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(create, range(24)))

        ids = [response["result"]["id"] for response in responses]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(self.cli.run("status")["result"]["tasks"], 24)
        self.assertTrue(self.cli.validate()["valid"])

    def test_seeded_state_machine_sequence(self) -> None:
        seed = 7919
        rng = random.Random(seed)
        self.cli.batch(
            {
                "type": "task.create",
                "input": {"title": f"State task {index}", "status": "pool"},
            }
            for index in range(100)
        )
        data = self.cli.inspect()
        active = [task["id"] for entry in data["daily"].values() for task in entry["tasks"]]
        commands: list[dict] = []

        for step in range(400):
            if not active:
                break
            task_id = rng.choice(active)
            operation = rng.choice(["schedule", "toggle", "pool", "rename", "delete", "journal"])
            if operation == "schedule":
                day = date(2026, rng.randint(1, 12), rng.randint(1, 28)).isoformat()
                commands.append({"type": "task.schedule", "taskId": task_id, "date": day})
            elif operation == "toggle":
                commands.append({"type": "task.toggleDone", "taskId": task_id})
            elif operation == "pool":
                commands.append({"type": "task.returnToPool", "taskId": task_id})
            elif operation == "rename":
                commands.append(
                    {"type": "task.update", "taskId": task_id, "patch": {"title": f"Renamed {step} seed {seed}"}}
                )
            elif operation == "delete" and len(active) > 10:
                commands.append({"type": "task.delete", "taskId": task_id})
                active.remove(task_id)
            else:
                commands.append(
                    {
                        "type": "journal.set",
                        "date": date(2026, rng.randint(1, 12), rng.randint(1, 28)).isoformat(),
                        "note": f"State-machine step {step} references @{task_id}",
                    }
                )

        try:
            self.cli.batch(commands)
        except Exception as error:
            self.fail(f"state-machine seed {seed} failed: {error}")
        report = self.cli.validate()
        self.assertTrue(report["valid"], f"seed {seed}: {report}")

    def test_year_scale_dataset(self) -> None:
        seed = 20260825
        count = 1200
        self.cli.batch(area_commands() + task_commands(count=count, seed=seed, year=2026))
        data = self.cli.inspect()
        task_ids = [task["id"] for entry in data["daily"].values() for task in entry["tasks"]]
        self.assertEqual(len(task_ids), count)

        self.cli.batch(habit_create_commands())
        data = self.cli.inspect()
        generated_habits = [
            habit["id"]
            for habit in data["habits"]
            if habit["name"] not in {"Plan the day", "Journal"}
        ]
        self.cli.batch(
            journal_and_week_commands(year=2026, seed=seed, task_ids=task_ids)
            + habit_log_commands(generated_habits, year=2026, seed=seed)
        )

        report = self.cli.validate()
        self.assertTrue(report["valid"], report)
        self.assertEqual(report["warnings"], 0, report)
        final = self.cli.inspect()
        self.assertGreaterEqual(len(final["daily"]), 365)
        self.assertGreaterEqual(len(final["weekly"]), 52)
        self.assertGreater(len(final["habitLogs"]), 500)
        self.assertGreaterEqual(len(final["areas"]), 11)


if __name__ == "__main__":
    unittest.main()

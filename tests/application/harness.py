from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
CLI_PATH = REPO_ROOT / "scripts" / "momentum.ts"


class MomentumCliError(AssertionError):
    pass


class MomentumCli:
    def __init__(
        self,
        data_path: Path,
        *,
        now: str = "2026-08-25T10:00:00.000Z",
        actor: str = "test",
    ) -> None:
        self.data_path = data_path
        self.now = now
        self.actor = actor
        self.bun = shutil.which("bun")
        if not self.bun:
            raise MomentumCliError("bun is required to run the Momentum application tests")

    def run(
        self,
        *arguments: str,
        expect_ok: bool = True,
        stdin: str | None = None,
        extra_env: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        command = [
            self.bun,
            str(CLI_PATH),
            *arguments,
            "--data",
            str(self.data_path),
            "--json",
            "--actor",
            self.actor,
            "--now",
            self.now,
        ]
        environment = os.environ.copy()
        environment.update(extra_env or {})
        completed = subprocess.run(
            command,
            cwd=REPO_ROOT,
            input=stdin,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            env=environment,
            check=False,
        )

        raw = completed.stdout.strip() or completed.stderr.strip()
        try:
            response = json.loads(raw)
        except json.JSONDecodeError as error:
            raise MomentumCliError(
                f"CLI did not return JSON (exit {completed.returncode})\n"
                f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
            ) from error

        if expect_ok and (completed.returncode != 0 or not response.get("ok")):
            raise MomentumCliError(
                f"CLI command failed: {' '.join(arguments)}\n"
                f"exit={completed.returncode}\n{json.dumps(response, indent=2)}"
            )
        if not expect_ok and response.get("ok"):
            raise MomentumCliError(
                f"CLI command unexpectedly succeeded: {' '.join(arguments)}"
            )
        return response

    def batch(
        self,
        commands: Iterable[dict[str, Any]],
        *,
        expect_ok: bool = True,
        extra_arguments: tuple[str, ...] = (),
    ) -> dict[str, Any]:
        return self.run(
            "batch",
            "--stdin",
            *extra_arguments,
            expect_ok=expect_ok,
            stdin=json.dumps(list(commands)),
        )

    def inspect(self) -> dict[str, Any]:
        return self.run("inspect")["result"]

    def validate(self) -> dict[str, Any]:
        return self.run("validate")["result"]

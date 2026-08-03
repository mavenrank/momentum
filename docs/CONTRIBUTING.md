# Contributing

## Commit Convention

Use concise conventional commit messages:

| Type | Meaning | Example |
| --- | --- | --- |
| `feat` | A new feature | `feat: add weekly review view` |
| `fix` | A bug fix | `fix: keep imported habits active` |
| `docs` | Documentation changes only | `docs: update roadmap` |
| `style` | Formatting, whitespace, linting, no behavior change | `style: format planner controls` |
| `refactor` | Code restructuring without behavior changes | `refactor: split daily task editor` |
| `perf` | Performance improvements | `perf: reduce planner recalculation` |
| `test` | Adding or updating tests | `test: add habit persistence tests` |
| `build` | Build system or dependency changes | `build: update vite config` |
| `ci` | CI/CD configuration changes | `ci: add build workflow` |
| `chore` | Miscellaneous maintenance | `chore: update gitignore` |
| `revert` | Reverts a previous commit | `revert: revert weekly view change` |

## Versioning

Momentum uses Semantic Versioning:

- `MAJOR`: incompatible or breaking changes.
- `MINOR`: backward-compatible features.
- `PATCH`: backward-compatible fixes.

Update `VERSION.txt` and `CHANGELOG.txt` together for release changes.

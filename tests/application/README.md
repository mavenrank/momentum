# Momentum application tests

These tests exercise Momentum through its real command-line adapter rather than
through browser selectors. They use only Python's standard library and Bun, so
the suite runs without installing pytest, Hypothesis, Selenium, or Playwright.

```powershell
bun run test:application
```

The suite covers:

- default conflict rejection and explicit safety controls;
- idempotent retries and optimistic revision checks;
- concurrent CLI processes writing through the cross-process lock;
- a replayable seeded state-machine command sequence;
- 1,200 tasks spread across a year, daily journals, weekly notes, custom areas,
  habits, and hundreds of habit logs;
- whole-store invariant validation after every scenario.

Every random scenario has a fixed seed. A failure reports that seed, making the
exact command sequence reproducible rather than flaky.

To create a standalone dataset for import into the web app:

```powershell
python -m tests.application.generate_year_dataset `
  --data C:\temp\momentum-load-test.json `
  --export C:\temp\momentum-web-import.json `
  --count 1200 `
  --seed 20260825
```

The target store must not already exist unless `--append` is supplied. The
export is a normal Momentum portable backup and can be loaded through Data →
Import JSON.

# Deep Dive Queue

A running list of topics the user wants researched, analysed, or aligned on
before they are implemented. Items move to `docs/DECISIONS.md` once a concrete
design choice needs to be made; items move into code once a decision is
locked.

## Open

1. **Persistence layer rewrite**
   Current behaviour: `usePlannerData` writes the entire planner JSON to
   `localStorage` on every state change (`src/hooks/usePlannerData.ts:5-22`,
   `src/lib/plannerData.ts:140-145`). Typing one character in a task title
   triggers a full re-serialise + a sync `setItem`. No debounce, no coalescing,
   no quota handling, no cross-tab sync.
   Target: debounced + coalesced writes, try/catch with quota surfacing,
   schema version on disk, IndexedDB as the primary store with JSON as the
   portability layer.
   > Coupled prerequisite: the daily tasks revamp (#2) needs batching for any
   > drag-and-drop / triage flow to feel responsive. The persistence rewrite
   > should land first or in lockstep.

2. **Daily tasks architecture revamp**
   Massive change to align with the user's pasted direction (heap/planned/
   scheduled/doing/waiting/done; areas; scheduledDate; follow-up
   relationships; daily as execution lens; weekly as planning; monthly as
   navigation). See `docs/DECISIONS.md` for sub-decisions.

3. **Areas vs P1-P4 priority**
   Keep both as independent axes (decision pending). Area = "what part of
   life"; P1-P4 = "how urgent."

4. **Scheduled status semantics**
   Decision: implicit. Setting `scheduledDate` auto-promotes a task to
   `scheduled`. The user types a date (or uses a picker), the task is
   scheduled. Open sub-question: how the "set a date" UX should look (text
   box with autodetect vs. picker vs. hybrid).

5. **Monthly view redesign**
   Remove completion %, task counts, P1 indicator. Decision deferred — see
   `docs/DECISIONS.md`.

6. **Journal decoupling**
   Split into a separate app eventually. Decision deferred — see
   `docs/DECISIONS.md`. For the current revamp the recommendation is to
   leave a seam (a `taskReferences: string[]` stub on `DailyEntry`).

7. **Follow-up task relationships**
   Follow-up is a relationship, not a tag. Decision deferred — see
   `docs/DECISIONS.md`.

8. **Habits metric hiding**
   Overview should not show percentages. Audit all views to confirm no
   metric leaks from the habit matrix into other surfaces.

9. **Cross-app task reference (T-IDs)**
   When the Journal splits, tasks need stable human-friendly IDs (e.g.
   `T-102`) so Journal entries can reference them loosely. Tied to #6.

10. **Drag-and-drop library choice**
    Needed for the daily/weekly/triage flows. Candidate: `@dnd-kit/core`.
    Tied to #1 (persistence must batch) and #2 (revamp).

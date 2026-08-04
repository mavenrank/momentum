import * as React from "react";

/**
 * Interface preferences — how the app is arranged, not what it holds.
 *
 * These are deliberately *not* part of `PlannerData`. Planner data is the
 * user's work: it is exported, versioned in a git repo and synced between
 * machines. Whether a toggle happened to be on when you closed a tab is none of
 * that, and putting it in the same store would make every layout fiddle look
 * like a data change to the diffing writer. It lives in localStorage alongside
 * the theme, which is the same kind of thing.
 */
export interface Preferences {
  /**
   * When true, turning time-blocking on in one lens turns it on in the other.
   * On by default: the toggle reads as a mode you are in, not a per-screen
   * setting, and having it silently differ between lenses is a surprise.
   */
  linkTimeBlocking: boolean;
  timeBlockingToday: boolean;
  timeBlockingWeek: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  linkTimeBlocking: true,
  timeBlockingToday: false,
  timeBlockingWeek: false,
};

const STORAGE_KEY = "momentum.preferences";

/* ---------------------------------------------------------------- store -- */

let current: Preferences = read();
const listeners = new Set<() => void>();

function read(): Preferences {
  if (typeof localStorage === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Spread over the defaults so a preference added later is not undefined for
    // anyone who already has a stored blob.
    return raw ? { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function setPreferences(patch: Partial<Preferences>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A refused write costs the preference, not the session.
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;

/**
 * Read preferences anywhere without threading a provider through the tree.
 * `useSyncExternalStore` keeps every consumer in step, so the Settings toggle
 * and the Planner header never disagree.
 */
export function usePreferences(): Preferences {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFERENCES);
}

/* ------------------------------------------------------- time blocking -- */

export type PlannerLensKey = "today" | "week";

/** Whether time-blocking is on for a lens, honouring the link. */
export function isTimeBlocking(preferences: Preferences, lens: PlannerLensKey): boolean {
  if (preferences.linkTimeBlocking) {
    return preferences.timeBlockingToday;
  }
  return lens === "today" ? preferences.timeBlockingToday : preferences.timeBlockingWeek;
}

/**
 * Turns time-blocking on or off for a lens.
 *
 * While linked, both flags are written rather than one shared flag being read —
 * so unlinking later leaves the two lenses agreeing with what was last on
 * screen, instead of one of them snapping to a stale value.
 */
export function setTimeBlocking(lens: PlannerLensKey, on: boolean): void {
  const preferences = getSnapshot();
  if (preferences.linkTimeBlocking) {
    setPreferences({ timeBlockingToday: on, timeBlockingWeek: on });
    return;
  }
  setPreferences(lens === "today" ? { timeBlockingToday: on } : { timeBlockingWeek: on });
}

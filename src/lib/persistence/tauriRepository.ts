import { invoke, isTauri } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import {
  AREAS_FILE,
  DOMAINS_FILE,
  HABITS_FILE,
  HABIT_LOGS_FILE,
  META_FILE,
  MONTHS_DIR,
  PURSUITS_FILE,
  WEEKS_FILE,
  assemble,
  diffFiles,
  projectToFiles,
  serialise,
  type MetaFile,
  type MonthFile,
  type StoreContents,
} from "./tauriStore";
import type { QuotaErrorHandler, Repository } from "./repository";
import { createEmptyData } from "../plannerData";
import { createDeviceTag, setDeviceTag } from "../taskId";
import type { Area, Domain, Habit, HabitLog, PlannerData, Pursuit, WeeklyEntry } from "../../types/planner";

/**
 * A `Repository` backed by a folder of JSON on the real filesystem.
 *
 * This exists because the browser cannot offer one. IndexedDB is scoped to
 * origin, browser and profile, the browser may evict it, and Firefox — which is
 * what Zen is — ships no directory picker, so a page running there cannot even
 * be handed a folder to back itself up into. Inside a Tauri window none of that
 * applies: there is a path, it is the same path every time, and nothing clears
 * it behind your back.
 *
 * The app above this file cannot tell the difference. Same `Repository`
 * interface, same `PlannerData`, same diff-before-write discipline — only the
 * medium changed.
 */

/** Whether this code is running inside the Tauri shell rather than a browser. */
export function isTauriShell(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- settings -- */

const SETTINGS_FILE = "settings.json";

interface ShellSettings {
  /** Absolute path to the folder holding the planner store. */
  dataDir: string;
  /** Two-character tag that keeps task IDs unique across machines. */
  deviceTag: string;
}

let settingsCache: ShellSettings | null = null;

/**
 * Settings live in the app-data directory, never in the data folder itself.
 *
 * That separation is not tidiness. The device tag identifies *this
 * installation*, and pointing two machines at the same synced folder is an
 * expected setup — if the tag travelled with the data, both machines would
 * adopt the same one and start minting colliding task IDs, which is precisely
 * what the tag exists to prevent.
 */
async function settingsPath(): Promise<string> {
  return join(await appDataDir(), SETTINGS_FILE);
}

async function loadSettings(): Promise<ShellSettings> {
  if (settingsCache) {
    return settingsCache;
  }

  const root = await appDataDir();
  await mkdir(root, { recursive: true });
  const path = await join(root, SETTINGS_FILE);

  if (await exists(path)) {
    try {
      const parsed = JSON.parse(await readTextFile(path)) as Partial<ShellSettings>;
      if (typeof parsed.dataDir === "string" && typeof parsed.deviceTag === "string") {
        settingsCache = { dataDir: parsed.dataDir, deviceTag: parsed.deviceTag };
        return settingsCache;
      }
    } catch (error) {
      // A corrupt settings file must not lock the user out of their planner;
      // falling back to the default location is recoverable, refusing to start
      // is not.
      console.error("Momentum: settings.json is unreadable, falling back to defaults.", error);
    }
  }

  const fresh: ShellSettings = {
    dataDir: await join(root, "data"),
    deviceTag: createDeviceTag(),
  };
  await writeSettings(fresh);
  return fresh;
}

async function writeSettings(settings: ShellSettings): Promise<void> {
  settingsCache = settings;
  await writeTextFile(await settingsPath(), serialise(settings));
}

/* --------------------------------------------------------------------- io -- */

/**
 * Writes a file by writing a sibling and renaming over the target.
 *
 * A half-written planner file is worse than no file, and the app is killed by
 * the user closing a window rather than by any orderly shutdown. `rename` on
 * NTFS replaces the destination in one step, so a reader either sees the whole
 * old file or the whole new one, never a truncated middle.
 */
async function writeAtomic(path: string, contents: string): Promise<void> {
  const temp = `${path}.tmp`;
  await writeTextFile(temp, contents);
  await rename(temp, path);
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  if (!(await exists(path))) {
    return fallback;
  }
  try {
    return JSON.parse(await readTextFile(path)) as T;
  } catch (error) {
    console.error(`Momentum: could not parse ${path}.`, error);
    return fallback;
  }
}

/** Grants the fs scope access to a folder chosen after the app was built. */
async function allowDataDir(path: string): Promise<void> {
  await invoke("allow_data_dir", { path });
}

async function ensureLayout(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await mkdir(await join(dataDir, MONTHS_DIR), { recursive: true });
}

async function readStore(dataDir: string): Promise<StoreContents> {
  const monthsDir = await join(dataDir, MONTHS_DIR);
  const months: Record<string, MonthFile> = {};

  if (await exists(monthsDir)) {
    for (const entry of await readDir(monthsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) {
        continue;
      }
      const month = entry.name.replace(/\.json$/, "");
      months[month] = await readJsonFile<MonthFile>(await join(monthsDir, entry.name), {
        tasks: [],
        notes: {},
      });
    }
  }

  return {
    meta: await readJsonFile<MetaFile | null>(await join(dataDir, META_FILE), null),
    areas: await readJsonFile<Area[]>(await join(dataDir, AREAS_FILE), []),
    domains: await readJsonFile<Domain[]>(await join(dataDir, DOMAINS_FILE), []),
    pursuits: await readJsonFile<Pursuit[]>(await join(dataDir, PURSUITS_FILE), []),
    habits: await readJsonFile<Habit[]>(await join(dataDir, HABITS_FILE), []),
    habitLogs: await readJsonFile<HabitLog[]>(await join(dataDir, HABIT_LOGS_FILE), []),
    weekly: await readJsonFile<Record<string, WeeklyEntry>>(await join(dataDir, WEEKS_FILE), {}),
    months,
  };
}

async function writeStore(
  dataDir: string,
  before: Map<string, string>,
  data: PlannerData,
): Promise<Map<string, string>> {
  const after = projectToFiles(data);
  const { write, remove: gone } = diffFiles(before, after);

  if (write.size === 0 && gone.length === 0) {
    return after;
  }

  await ensureLayout(dataDir);

  for (const [relative, contents] of write) {
    await writeAtomic(await join(dataDir, relative), contents);
  }

  // A month file with nothing left in it is deleted rather than left as an
  // empty husk, so the folder always reflects what is actually there.
  for (const relative of gone) {
    const path = await join(dataDir, relative);
    if (await exists(path)) {
      await remove(path);
    }
  }

  return after;
}

/* ------------------------------------------------------------- repository -- */

export function createTauriRepository(): Repository {
  const errorHandlers = new Set<QuotaErrorHandler>();

  // What the folder held after the last successful read or write.
  let snapshot = new Map<string, string>();
  let dataDir: string | null = null;

  function report(error: unknown) {
    for (const handler of errorHandlers) {
      handler(error);
    }
  }

  return {
    async load() {
      try {
        const settings = await loadSettings();
        // Must happen before anything can create a task: ID generation reads
        // the tag synchronously from inside a state reducer.
        setDeviceTag(settings.deviceTag);

        await allowDataDir(settings.dataDir);
        dataDir = settings.dataDir;
        await ensureLayout(dataDir);

        const contents = await readStore(dataDir);
        if (contents.meta && contents.meta.version > 4) {
          throw new Error(`Unsupported future planner schema ${contents.meta.version}.`);
        }

        if (!contents.meta) {
          // Nothing here yet — seed the folder rather than leave the app
          // looking at a store that does not exist.
          const empty = createEmptyData();
          snapshot = await writeStore(dataDir, new Map(), empty);
          return empty;
        }

        const data = assemble(contents);
        if (contents.meta.version < 4) {
          snapshot = await writeStore(dataDir, new Map(), data);
          return data;
        }
        // The baseline is what *we* would have written, not the bytes on disk.
        // If the folder was last touched by the CLI or by hand, the first save
        // normalises it; every save after that is a true diff.
        snapshot = projectToFiles(data);
        return data;
      } catch (error) {
        dataDir = null;
        console.error("Momentum: could not read the planner folder.", error);
        report(error);
        return createEmptyData();
      }
    },

    async save(data) {
      if (!dataDir) {
        return;
      }
      try {
        snapshot = await writeStore(dataDir, snapshot, data);
      } catch (error) {
        console.error("Momentum: could not write to the planner folder.", error);
        report(error);
      }
    },

    /**
     * A no-op in the shell.
     *
     * In the browser this carries writes between tabs over a `BroadcastChannel`.
     * There are no tabs here — one window, one writer, one process. The obvious
     * alternative, a file watcher, was deliberately not built: its only real use
     * would be noticing a sync client dropping in a newer file underneath a
     * running app, and reloading state from that without a merge strategy would
     * silently discard whatever the user had just typed. Last-write-wins across
     * machines is the honest behaviour until real sync exists, and real sync is
     * out of scope.
     */
    subscribe() {
      return () => {};
    },

    onQuotaError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
  };
}

/* ------------------------------------------------------- location control -- */

export interface StoreLocation {
  path: string;
  /** True when the store sits in the default app-data location. */
  isDefault: boolean;
}

export async function getStoreLocation(): Promise<StoreLocation> {
  const settings = await loadSettings();
  const fallback = await join(await appDataDir(), "data");
  return { path: settings.dataDir, isDefault: settings.dataDir === fallback };
}

/**
 * Points the store at a different folder.
 *
 * Pointing it at something Drive or Syncthing already watches is the entire
 * argument for this shell over a browser tab, so this has to be one button and
 * not a config file. An empty target is seeded with the data currently loaded;
 * a target that already holds a store is adopted as-is, and *its* contents win.
 *
 * Returns the chosen path, or null if the user dismissed the picker.
 */
export async function chooseStoreLocation(current: PlannerData): Promise<string | null> {
  const chosen = await openDialog({
    directory: true,
    multiple: false,
    title: "Choose a folder for Momentum's data",
  });

  if (typeof chosen !== "string") {
    return null;
  }

  await allowDataDir(chosen);
  await ensureLayout(chosen);

  const alreadyAStore = await exists(await join(chosen, META_FILE));
  if (!alreadyAStore) {
    await writeStore(chosen, new Map(), current);
  }

  const settings = await loadSettings();
  await writeSettings({ ...settings, dataDir: chosen });
  return chosen;
}

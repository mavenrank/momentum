import { db, META_KEYS } from "./db";
import { validateImport } from "../plannerData";
import type { PlannerData } from "../../types/planner";

/**
 * Snapshot backups into a folder the user picks.
 *
 * This is the part that actually answers "what if the machine is gone". Marking
 * storage persistent stops the browser evicting the database; it does nothing
 * about the disk failing. A plain JSON file written into a folder the user
 * already syncs — Drive, Dropbox, Syncthing, a NAS mount — turns any of those
 * into an off-device backup without this app needing to know they exist.
 *
 * Deliberately a *snapshot*, not a live store: the file is written whole, it is
 * never the source of truth while the app is running, and restoring is an
 * explicit act. That keeps it immune to the merge problems a shared live file
 * would have, at the cost of last-write-wins if two machines write the same
 * folder — which is the right trade until real sync exists.
 */

export const FILE_PREFIX = "momentum-";
export const FILE_SUFFIX = ".json";
/** Snapshots kept in the folder before the oldest are pruned. */
const KEEP_SNAPSHOTS = 30;
/** Shortest gap between automatic snapshots. */
export const BACKUP_INTERVAL_MS = 10 * 60 * 1000;

export interface BackupStatus {
  supported: boolean;
  /** Name of the chosen folder, or null when none has been picked. */
  directoryName: string | null;
  /** When the last snapshot was written. */
  lastWrittenAt: string | null;
  /** True when the handle exists but the browser has dropped permission. */
  needsPermission: boolean;
}

/**
 * Whether this browser will let a page write to a folder the user picks.
 *
 * Chromium ships the local-disk pickers; Firefox and its derivatives (Zen,
 * LibreWolf, Floorp) deliberately do not, and support only the origin-private
 * file system — which is invisible to the user and so useless as a backup. On
 * those browsers the snapshot has to leave through the downloads folder
 * instead, which is what `snapshotFilename` and Settings → Data's export button
 * are for.
 */
export function backupsSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** The filename a snapshot takes, wherever it is written. */
export function snapshotFilename(at: Date = new Date()): string {
  // Colons are not legal in filenames on Windows, so the timestamp is flattened.
  return `${FILE_PREFIX}${at.toISOString().replace(/[:.]/g, "-")}${FILE_SUFFIX}`;
}

/* ------------------------------------------------------------- handles -- */

/**
 * Directory handles are structured-cloneable, so IndexedDB can hold one across
 * sessions — which is the only reason the folder does not have to be re-picked
 * on every launch. The permission it carries does not survive, though, so it
 * has to be re-requested; that is what `needsPermission` reports.
 */
async function readHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.meta.get(META_KEYS.backupDirectory);
  return (row?.value as FileSystemDirectoryHandle | undefined) ?? null;
}

async function hasPermission(
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<boolean> {
  const options = { mode: "readwrite" } as const;
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }
  if (!request) {
    return false;
  }
  return (await handle.requestPermission(options)) === "granted";
}

/* --------------------------------------------------------------- api -- */

export async function readBackupStatus(): Promise<BackupStatus> {
  if (!backupsSupported()) {
    return {
      supported: false,
      directoryName: null,
      lastWrittenAt: null,
      needsPermission: false,
    };
  }

  const handle = await readHandle();
  const lastWritten = await db.meta.get(META_KEYS.backupWrittenAt);

  return {
    supported: true,
    directoryName: handle?.name ?? null,
    lastWrittenAt: (lastWritten?.value as string | undefined) ?? null,
    needsPermission: handle ? !(await hasPermission(handle, false)) : false,
  };
}

/** Prompts for a folder and remembers it. Returns null if the user cancels. */
export async function chooseBackupFolder(): Promise<string | null> {
  if (!backupsSupported()) {
    return null;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "momentum-backups",
      mode: "readwrite",
      startIn: "documents",
    });

    if (!(await hasPermission(handle, true))) {
      return null;
    }

    await db.meta.put({ key: META_KEYS.backupDirectory, value: handle });
    return handle.name;
  } catch {
    // An AbortError just means the user closed the picker.
    return null;
  }
}

export async function forgetBackupFolder(): Promise<void> {
  await db.meta.delete(META_KEYS.backupDirectory);
  await db.meta.delete(META_KEYS.backupWrittenAt);
}

/**
 * Writes a snapshot, pruning the oldest once the folder is full.
 *
 * `force` is what the "Back up now" button passes; without it the call is a
 * no-op inside the interval, so the autosave loop can invoke it freely.
 */
export async function writeSnapshot(
  data: PlannerData,
  options: { force?: boolean } = {},
): Promise<string | null> {
  const handle = await readHandle();
  if (!handle) {
    return null;
  }

  if (!options.force) {
    const last = (await db.meta.get(META_KEYS.backupWrittenAt))?.value as string | undefined;
    if (last && Date.now() - new Date(last).getTime() < BACKUP_INTERVAL_MS) {
      return null;
    }
  }

  if (!(await hasPermission(handle, Boolean(options.force)))) {
    return null;
  }

  const name = snapshotFilename();
  const file = await handle.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();

  await db.meta.put({ key: META_KEYS.backupWrittenAt, value: new Date().toISOString() });
  await prune(handle);

  return name;
}

async function prune(handle: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === "file" && name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX)) {
      names.push(name);
    }
  }

  // The timestamp is fixed-width, so lexical order is chronological order.
  names.sort();
  for (const name of names.slice(0, Math.max(0, names.length - KEEP_SNAPSHOTS))) {
    await handle.removeEntry(name).catch(() => undefined);
  }
}

export interface SnapshotSummary {
  name: string;
  savedAt: Date;
  size: number;
}

/** Lists what is in the folder, newest first. */
export async function listSnapshots(): Promise<SnapshotSummary[]> {
  const handle = await readHandle();
  if (!handle || !(await hasPermission(handle, false))) {
    return [];
  }

  const snapshots: SnapshotSummary[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_SUFFIX)) {
      continue;
    }
    const file = await (entry as FileSystemFileHandle).getFile();
    snapshots.push({ name, savedAt: new Date(file.lastModified), size: file.size });
  }

  return snapshots.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
}

/**
 * Reads one snapshot back. The payload goes through the same validation and
 * migration path as a manual import, so an old backup is upgraded rather than
 * rejected — a backup you cannot restore is not a backup.
 */
export async function restoreSnapshot(name: string): Promise<PlannerData | null> {
  const handle = await readHandle();
  if (!handle || !(await hasPermission(handle, true))) {
    return null;
  }

  try {
    const file = await (await handle.getFileHandle(name)).getFile();
    return validateImport(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}

/** Restores whatever the folder's newest snapshot is. */
export async function restoreLatest(): Promise<PlannerData | null> {
  const [newest] = await listSnapshots();
  return newest ? restoreSnapshot(newest.name) : null;
}

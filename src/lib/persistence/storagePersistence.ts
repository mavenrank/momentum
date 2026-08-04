/**
 * Browser storage is evictable by default. Under disk pressure a browser is
 * free to throw away an origin's IndexedDB without asking, and "I only opened
 * it once a week" is exactly the heuristic that makes an origin a candidate.
 *
 * `navigator.storage.persist()` opts out of that. It is worth being clear about
 * what it does not do: it does not choose where the data lives, and it does not
 * survive the user clearing site data. It is one guarantee only — the browser
 * will not evict this origin on its own. Everything about surviving the death
 * of the machine is the backup module's job, not this one's.
 */

export interface StorageStatus {
  /** Whether the browser has agreed not to evict this origin. */
  persisted: boolean;
  /** Whether the browser exposes the Storage API at all. */
  supported: boolean;
  /** Bytes currently used, when the browser will say. */
  usage?: number;
  /** Bytes the origin may use, when the browser will say. */
  quota?: number;
}

function supported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.storage?.persist);
}

/**
 * Asks for persistence, and reports what the browser decided.
 *
 * Chrome grants this silently based on engagement signals — bookmarking or
 * installing the app is usually enough — while Firefox prompts. Either way a
 * refusal is not an error: the app keeps working, it is just evictable, which
 * is what the Settings panel exists to tell the user.
 */
export async function requestPersistentStorage(): Promise<StorageStatus> {
  if (!supported()) {
    return { persisted: false, supported: false };
  }

  try {
    const already = await navigator.storage.persisted();
    const persisted = already || (await navigator.storage.persist());
    return { ...(await measure()), persisted, supported: true };
  } catch {
    return { persisted: false, supported: true };
  }
}

export async function readStorageStatus(): Promise<StorageStatus> {
  if (!supported()) {
    return { persisted: false, supported: false };
  }

  try {
    return { ...(await measure()), persisted: await navigator.storage.persisted(), supported: true };
  } catch {
    return { persisted: false, supported: true };
  }
}

async function measure(): Promise<{ usage?: number; quota?: number }> {
  if (!navigator.storage?.estimate) {
    return {};
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return {};
  }
}

/** "1.4 MB" — for the storage line in Settings. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) {
    return "unknown";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

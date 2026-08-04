/**
 * Working out the smallest set of writes that turns one set of records into
 * another.
 *
 * The repository used to clear every table and rewrite it on each save. That is
 * cheap-looking and wrong in two ways: the cost grows with the size of the
 * dataset rather than the size of the edit, and to anything watching the
 * database it reads as "the user deleted everything, then recreated it" — which
 * is precisely the thing a sync engine must never be told by mistake.
 */

/** Fields the writer owns; they are excluded when deciding what changed. */
const SYNC_KEYS = new Set(["updatedAt", "deletedAt"]);

export interface SyncedRecord {
  updatedAt?: string;
  /** ISO timestamp when the record was removed; absent while it is live. */
  deletedAt?: string;
}

/**
 * Key-order-independent serialisation, so two records differing only in the
 * order their properties happened to be built compare as equal. Without this
 * the writer would rewrite rows that had not actually changed — which is most
 * of them, since the app rebuilds objects with spreads on every edit.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => entry !== undefined && !SYNC_KEYS.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([key, entry]) => `${key}:${stableStringify(entry)}`).join(",")}}`;
}

export interface TableChanges<T> {
  puts: T[];
  /** Rows that vanished from the data and need marking as deleted. */
  tombstones: T[];
}

/**
 * Compares two keyed sets of records.
 *
 * A record present in `next` but not `previous` is new. One present in both but
 * materially different is an update. One present in `previous` and gone from
 * `next` is a deletion — recorded as a tombstone rather than a removal, because
 * a row that is simply absent is indistinguishable from one that never arrived,
 * and the other side would resurrect it on the next merge.
 */
export function diffRecords<T extends SyncedRecord>(
  previous: Map<string, T>,
  next: Map<string, T>,
  now: string,
): TableChanges<T> {
  const puts: T[] = [];
  const tombstones: T[] = [];

  for (const [key, row] of next) {
    const before = previous.get(key);
    if (!before) {
      puts.push({ ...row, updatedAt: now });
      continue;
    }
    // A row that was tombstoned and is present again has been undeleted.
    if (before.deletedAt || stableStringify(before) !== stableStringify(row)) {
      puts.push({ ...row, updatedAt: now, deletedAt: undefined });
    }
  }

  for (const [key, row] of previous) {
    if (!next.has(key) && !row.deletedAt) {
      tombstones.push({ ...row, updatedAt: now, deletedAt: now });
    }
  }

  return { puts, tombstones };
}

export function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]));
}

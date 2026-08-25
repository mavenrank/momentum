import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { createEmptyData, normalizePlannerData } from "../../src/lib/plannerData";
import type { PlannerData } from "../../src/types/planner";

export const CLI_STORE_FORMAT = "momentum-cli-store";
export const CLI_STORE_VERSION = 1;

export interface AuditEntry {
  at: string;
  actor: "cli" | "llm" | "test";
  command: string;
  revision: number;
  summary: string;
  idempotencyKey?: string;
}

export interface IdempotencyRecord {
  fingerprint: string;
  response: unknown;
}

export interface CliStore {
  format: typeof CLI_STORE_FORMAT;
  version: typeof CLI_STORE_VERSION;
  revision: number;
  data: PlannerData;
  audit: AuditEntry[];
  idempotency: Record<string, IdempotencyRecord>;
}

export function createCliStore(): CliStore {
  return {
    format: CLI_STORE_FORMAT,
    version: CLI_STORE_VERSION,
    revision: 0,
    data: createEmptyData(),
    audit: [],
    idempotency: {},
  };
}

function isPlannerData(value: unknown): value is PlannerData {
  return Boolean(
    value &&
      typeof value === "object" &&
      "daily" in value &&
      "weekly" in value &&
      "version" in value,
  );
}

export async function readCliStore(path: string): Promise<CliStore> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createCliStore();
    }
    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    "format" in parsed &&
    (parsed as { format?: unknown }).format === CLI_STORE_FORMAT
  ) {
    const envelope = parsed as Partial<CliStore>;
    if (envelope.version !== CLI_STORE_VERSION || !isPlannerData(envelope.data)) {
      throw new Error("Unsupported or malformed Momentum CLI store.");
    }
    return {
      format: CLI_STORE_FORMAT,
      version: CLI_STORE_VERSION,
      revision: Number.isInteger(envelope.revision) ? Number(envelope.revision) : 0,
      data: normalizePlannerData(envelope.data),
      audit: Array.isArray(envelope.audit) ? envelope.audit : [],
      idempotency:
        envelope.idempotency && typeof envelope.idempotency === "object"
          ? envelope.idempotency
          : {},
    };
  }

  // A portable Momentum backup can be used directly as the starting point.
  if (isPlannerData(parsed)) {
    return { ...createCliStore(), data: normalizePlannerData(parsed) };
  }

  throw new Error("File is neither a Momentum CLI store nor a Momentum backup.");
}

/** Temp-file + rename keeps a crash from leaving half a JSON document behind. */
export async function writeCliStore(path: string, store: CliStore): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");

  try {
    await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

const LOCK_WAIT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Cross-process file lock. The command reads current state only after the lock
 * is held, so serialisation cannot accidentally protect a stale read.
 */
export async function withCliStoreLock<T>(
  path: string,
  operation: (store: CliStore) => Promise<T>,
): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let lock: Awaited<ReturnType<typeof open>> | null = null;

  while (!lock) {
    try {
      lock = await open(lockPath, "wx");
      await lock.writeFile(
        JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
        "utf8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      const age = await stat(lockPath)
        .then((entry) => Date.now() - entry.mtimeMs)
        .catch(() => 0);
      if (age > STALE_LOCK_MS) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for the data lock: ${lockPath}`);
      }
      await delay(25);
    }
  }

  try {
    return await operation(await readCliStore(path));
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}

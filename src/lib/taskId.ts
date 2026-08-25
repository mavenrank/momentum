import { toDateKey } from "./date";

/**
 * Builds an immutable task ID of the form `T-YYYYMMDD-NNNN` or, once a device
 * tag is known, `T-YYYYMMDD-NNNN-XX`.
 *
 * The date prefix records when the task was created and `NNNN` is a global
 * counter climbing across every task ever created. That counter alone is only
 * unique on the machine that holds it: two devices working offline would both
 * hand out `0007` and collide the moment their data met. The two-character
 * device tag is what makes an ID safe to mint without asking anyone first.
 *
 * IDs are immutable, so existing untagged IDs are left exactly as they are —
 * they were minted when this installation was the only writer, and the format
 * stays readable either way.
 */
export function generateTaskId(
  date: Date | string,
  counter: number,
  deviceTag?: string,
): string {
  const dateKey = typeof date === "string" ? date : toDateKey(date);
  const compact = dateKey.replace(/-/g, "");
  const base = `T-${compact}-${String(counter).padStart(4, "0")}`;
  return deviceTag ? `${base}-${deviceTag}` : base;
}

/**
 * Canonical task-ID body, shared by validators and text features such as
 * journal mentions. Keeping one source prevents consumers from silently
 * falling behind when the ID format grows.
 */
export const TASK_ID_SOURCE = String.raw`T-(\d{8})-(\d{4,})(?:-([0-9a-z]{2,4}))?`;

const TASK_ID_PATTERN = new RegExp(`^${TASK_ID_SOURCE}$`, "i");

export function isTaskId(value: string): boolean {
  return TASK_ID_PATTERN.test(value);
}

/** Reads the counter back out of an ID, used when rebuilding `nextTaskId`. */
export function parseTaskIdCounter(id: string): number | null {
  const match = TASK_ID_PATTERN.exec(id);
  return match ? Number(match[2]) : null;
}

/** Reads the device tag out of an ID, or null for one minted before tagging. */
export function parseTaskIdDevice(id: string): string | null {
  const match = TASK_ID_PATTERN.exec(id);
  return match?.[3]?.toLowerCase() ?? null;
}

/**
 * A short, stable identifier for this installation. Two characters of base36
 * gives 1296 possibilities — ample when the population is a handful of personal
 * devices, and short enough to keep the ID readable.
 */
export function createDeviceTag(): string {
  const value = Math.floor(Math.random() * 36 ** 2);
  return value.toString(36).padStart(2, "0");
}

/**
 * The tag for this installation, read from storage once at load.
 *
 * Task creation happens inside a synchronous state reducer, which cannot await
 * a database read — so the value is cached here by the repository as it loads,
 * before anything has had a chance to create a task.
 */
let activeDeviceTag: string | null = null;

export function setDeviceTag(tag: string | null): void {
  activeDeviceTag = tag;
}

export function getDeviceTag(): string | undefined {
  return activeDeviceTag ?? undefined;
}

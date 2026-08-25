import { TASK_ID_SOURCE } from "./taskId";

// The negative lookahead matters: without it an invalid or newer ID can be
// accepted as a shorter valid prefix, producing a reference that can never
// resolve to the task the user mentioned.
const MENTION_PATTERN = new RegExp(`@(${TASK_ID_SOURCE})(?![0-9A-Za-z-])`, "g");

/** Pulls the `@T-YYYYMMDD-NNNN` mentions out of a journal note, de-duplicated. */
export function extractTaskReferences(note: string): string[] {
  const found = new Set<string>();
  for (const match of note.matchAll(MENTION_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

export interface NoteSegment {
  text: string;
  taskId?: string;
}

/** Splits a note into plain text and mention segments for rendering. */
export function toNoteSegments(note: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let cursor = 0;

  for (const match of note.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ text: note.slice(cursor, start) });
    }
    segments.push({ text: match[0], taskId: match[1] });
    cursor = start + match[0].length;
  }

  if (cursor < note.length) {
    segments.push({ text: note.slice(cursor) });
  }

  return segments;
}

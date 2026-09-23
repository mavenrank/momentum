import { allTasks } from "../plannerData";
import { areaName } from "../areas";
import { areaPath } from "../organization";
import type { Area, DailyTask, Domain, PlannerData } from "../../types/planner";

export interface LogseqFile {
  name: string;
  content: string;
}

function yamlString(value: string): string {
  // Quote anything that YAML would otherwise reinterpret.
  return /^[\w .,/-]+$/.test(value) ? value : JSON.stringify(value);
}

/**
 * One markdown page per task: YAML frontmatter Logseq reads as page properties,
 * then the title, the short summary, and the long description as the body.
 */
export function taskToMarkdown(task: DailyTask, areas: Area[] = [], pursuitName?: string, domains: Domain[] = []): string {
  const frontmatter: Array<[string, string]> = [
    ["id", task.id],
    ["title", yamlString(task.title)],
    ["status", task.status],
  ];

  if (task.priority) {
    frontmatter.push(["priority", task.priority]);
  }
  if (task.area) {
    frontmatter.push(["area", yamlString(areaPath({ areas, domains }, task.area) ?? areaName(areas, task.area) ?? task.area)]);
  }
  const domainId = task.area ? areas.find((area) => area.id === task.area)?.domainId : task.domainId;
  const domain = domains.find((entry) => entry.id === domainId);
  if (domain) frontmatter.push(["domain", yamlString(domain.name)]);
  if (task.relatedAreaIds?.length) frontmatter.push(["related-areas", yamlString(task.relatedAreaIds.map((id) => areaPath({ areas, domains }, id) ?? id).join(", "))]);
  if (task.pursuitId) {
    frontmatter.push(["pursuit", yamlString(pursuitName ?? task.pursuitId)]);
  }
  if (task.summary) {
    frontmatter.push(["summary", yamlString(task.summary)]);
  }
  if (task.scheduledDate) {
    frontmatter.push(["scheduled", task.scheduledDate]);
  }
  if (task.timeOfDay) {
    frontmatter.push(["time", task.timeOfDay]);
  }
  frontmatter.push(["created", task.createdAt]);
  frontmatter.push(["updated", task.updatedAt]);
  if (task.completedAt) {
    frontmatter.push(["completed", task.completedAt]);
  }
  if (task.relationships.followUpOf) {
    frontmatter.push(["follow-up-of", `[[${task.relationships.followUpOf}]]`]);
  }
  if (task.relationships.dependsOn.length > 0) {
    frontmatter.push([
      "depends-on",
      task.relationships.dependsOn.map((id) => `[[${id}]]`).join(", "),
    ]);
  }
  if (task.relationships.blocks.length > 0) {
    frontmatter.push(["blocks", task.relationships.blocks.map((id) => `[[${id}]]`).join(", ")]);
  }
  if (task.relationships.related.length > 0) {
    frontmatter.push(["related", task.relationships.related.map((id) => `[[${id}]]`).join(", ")]);
  }

  const lines = [
    "---",
    ...frontmatter.map(([key, value]) => `${key}: ${value}`),
    "---",
    "",
    `- ${task.title}`,
  ];

  if (task.summary) {
    lines.push(`  - ${task.summary}`);
  }

  if (task.description) {
    lines.push("  - ## Description");
    // Logseq is outline-based, so each paragraph becomes its own nested block.
    for (const paragraph of task.description.split(/\n{2,}/)) {
      const block = paragraph
        .split("\n")
        .map((line, index) => (index === 0 ? `    - ${line}` : `      ${line}`))
        .join("\n");
      lines.push(block);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildLogseqFiles(data: PlannerData): LogseqFile[] {
  return allTasks(data)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((task) => ({ name: `${task.id}.md`, content: taskToMarkdown(task, data.areas, data.pursuits.find((pursuit) => pursuit.id === task.pursuitId)?.name, data.domains) }));
}

/** True when the browser can write to a user-chosen directory. */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

interface DirectoryPickerWindow {
  showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<{
    getFileHandle: (
      name: string,
      options?: { create?: boolean },
    ) => Promise<{ createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;
  }>;
}

/**
 * Writes one file per task into a folder the user picks — typically
 * `Logseq/pages/Planner Tasks/`. Re-running overwrites, so Logseq picks up the
 * current state on its next reload.
 */
export async function exportToLogseqDirectory(data: PlannerData): Promise<number> {
  const picker = window as unknown as DirectoryPickerWindow;
  const directory = await picker.showDirectoryPicker({ mode: "readwrite" });
  const files = buildLogseqFiles(data);

  for (const file of files) {
    const handle = await directory.getFileHandle(file.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.content);
    await writable.close();
  }

  return files.length;
}

/**
 * Fallback for browsers without the File System Access API: a single markdown
 * file with each task page delimited, which the user can split or paste in.
 */
export function buildLogseqBundle(data: PlannerData): string {
  return buildLogseqFiles(data)
    .map((file) => `<!-- file: ${file.name} -->\n${file.content}`)
    .join("\n");
}

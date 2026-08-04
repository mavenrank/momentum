import * as React from "react";
import { Download, FileText, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/toast";
import { BackupFolderCard } from "./BackupFolderCard";
import { getAreaColor } from "@/lib/areas";
import { snapshotFilename } from "@/lib/persistence/folderBackup";
import {
  buildLogseqBundle,
  exportToLogseqDirectory,
  supportsDirectoryPicker,
} from "@/lib/export/logseq";
import { allTasks, validateImport } from "@/lib/plannerData";
import { STATUS_LABELS, TASK_STATUSES } from "@/types/planner";
import type { PlannerData } from "@/types/planner";

interface DataViewProps {
  data: PlannerData;
  replaceData: (data: PlannerData) => void;
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DataView({ data, replaceData }: DataViewProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [message, setMessage] = React.useState("");
  const { toast } = useToast();

  const tasks = React.useMemo(() => allTasks(data), [data]);

  const stats = React.useMemo(() => {
    const byStatus = new Map(TASK_STATUSES.map((status) => [status, 0]));
    const byArea = new Map<string, number>();
    let withSummary = 0;
    let withDescription = 0;

    for (const task of tasks) {
      byStatus.set(task.status, (byStatus.get(task.status) ?? 0) + 1);
      const area = task.area ?? "Unassigned";
      byArea.set(area, (byArea.get(area) ?? 0) + 1);
      if (task.summary) {
        withSummary += 1;
      }
      if (task.description) {
        withDescription += 1;
      }
    }

    return {
      byStatus,
      byArea: [...byArea.entries()].sort((a, b) => b[1] - a[1]),
      withSummary,
      withDescription,
    };
  }, [tasks]);

  function exportJson() {
    download(
      JSON.stringify(data, null, 2),
      `momentum-backup-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json",
    );
  }

  async function exportLogseq() {
    if (!supportsDirectoryPicker()) {
      download(
        buildLogseqBundle(data),
        `momentum-logseq-${new Date().toISOString().slice(0, 10)}.md`,
        "text/markdown",
      );
      setMessage(
        "This browser cannot write to a folder, so all task pages were bundled into one markdown file.",
      );
      return;
    }

    try {
      const count = await exportToLogseqDirectory(data);
      setMessage(`Exported ${count} task page${count === 1 ? "" : "s"} to the selected folder.`);
      toast(`${count} task pages exported.`);
    } catch (error) {
      // An aborted directory picker is a normal user action, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessage("Could not write to that folder.");
    }
  }

  async function importData(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validated = validateImport(parsed);
      if (!validated) {
        setMessage("That file does not look like a Momentum backup.");
        return;
      }
      replaceData(validated);
      setMessage("Backup imported.");
      toast("Backup imported.");
    } catch {
      setMessage("Could not read that JSON file.");
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Schema v{data.version} · stored in IndexedDB
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <BackupFolderCard
          data={data}
          replaceData={replaceData}
          onDownloadSnapshot={() =>
            download(JSON.stringify(data, null, 2), snapshotFilename(), "application/json")
          }
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Portable backup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportJson}>
                <Download className="size-4" />
                Export JSON
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" />
                Import JSON
              </Button>
              <input
                accept="application/json"
                hidden
                ref={fileInputRef}
                type="file"
                onChange={(event) => {
                  void importData(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Exports use the current v{data.version} schema. Older v1 backups are migrated
              automatically on import.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Logseq export</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={() => void exportLogseq()}>
              <FileText className="size-4" />
              Export to Logseq
            </Button>
            <p className="text-xs text-muted-foreground">
              Writes one <code className="font-mono">T-YYYYMMDD-NNNN.md</code> page per task into a
              folder you choose (e.g. <code className="font-mono">Logseq/pages/Planner Tasks/</code>
              ). Each page carries YAML frontmatter plus the summary and long description, so you
              can reference tasks as <code className="font-mono">[[T-20260714-0001]]</code>.
            </p>
          </CardContent>
        </Card>
      </div>

      {message ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{message}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total tasks</span>
              <span className="font-medium">{tasks.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">With a summary line</span>
              <span className="font-medium">{stats.withSummary}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">With a long description</span>
              <span className="font-medium">{stats.withDescription}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily entries</span>
              <span className="font-medium">{Object.keys(data.daily).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Weekly entries</span>
              <span className="font-medium">{Object.keys(data.weekly).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active habits</span>
              <span className="font-medium">
                {data.habits.filter((habit) => !habit.archived).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Next task ID</span>
              <span className="font-mono text-xs">{data.nextTaskId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last updated</span>
              <span className="font-medium">{new Date(data.updatedAt).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                By status
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {TASK_STATUSES.map((status) => (
                  <Badge key={status} variant="muted" className="gap-1">
                    {STATUS_LABELS[status]}
                    <span className="font-mono">{stats.byStatus.get(status) ?? 0}</span>
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                By area
              </h4>
              {stats.byArea.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tasks yet.</p>
              ) : (
                <div className="space-y-1">
                  {stats.byArea.map(([area, count]) => (
                    <div key={area} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getAreaColor(
                            data.areas,
                            area === "Unassigned" ? undefined : area,
                          ),
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{area}</span>
                      <span className="font-mono text-xs text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

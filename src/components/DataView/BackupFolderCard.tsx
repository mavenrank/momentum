import * as React from "react";
import {
  Download,
  FolderOpen,
  HardDrive,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/toast";
import {
  backupsSupported,
  chooseBackupFolder,
  forgetBackupFolder,
  listSnapshots,
  readBackupStatus,
  restoreSnapshot,
  writeSnapshot,
  type BackupStatus,
  type SnapshotSummary,
} from "@/lib/persistence/folderBackup";
import {
  formatBytes,
  readStorageStatus,
  requestPersistentStorage,
  type StorageStatus,
} from "@/lib/persistence/storagePersistence";
import type { PlannerData } from "@/types/planner";

interface BackupFolderCardProps {
  data: PlannerData;
  replaceData: (data: PlannerData) => void;
  /** Fallback for browsers with no folder access — see `backupsSupported`. */
  onDownloadSnapshot: () => void;
}

/**
 * The two halves of "will my data still be here tomorrow", in one place:
 * whether the browser has promised not to evict it, and whether a copy exists
 * somewhere that outlives the browser.
 */
export function BackupFolderCard({
  data,
  replaceData,
  onDownloadSnapshot,
}: BackupFolderCardProps) {
  const { toast } = useToast();
  const [storage, setStorage] = React.useState<StorageStatus | null>(null);
  const [backup, setBackup] = React.useState<BackupStatus | null>(null);
  const [snapshots, setSnapshots] = React.useState<SnapshotSummary[]>([]);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setStorage(await readStorageStatus());
    const status = await readBackupStatus();
    setBackup(status);
    setSnapshots(status.directoryName ? await listSnapshots() : []);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function pickFolder() {
    setBusy(true);
    try {
      const name = await chooseBackupFolder();
      if (name) {
        await writeSnapshot(data, { force: true });
        toast(`Backing up to ${name}.`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function backUpNow() {
    setBusy(true);
    try {
      const name = await writeSnapshot(data, { force: true });
      toast(name ? "Snapshot written." : "Could not write to that folder.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    if (!window.confirm(`Replace everything in Momentum with the contents of ${name}?`)) {
      return;
    }

    const restored = await restoreSnapshot(name);
    if (!restored) {
      toast("Could not read that snapshot.");
      return;
    }
    replaceData(restored);
    toast("Snapshot restored.");
  }

  async function enablePersistence() {
    const status = await requestPersistentStorage();
    setStorage(status);
    toast(
      status.persisted
        ? "This browser will keep Momentum's data."
        : "The browser declined for now — a folder backup is the safer bet.",
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Durability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* --- eviction ------------------------------------------------ */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {storage?.persisted ? (
              <ShieldCheck className="size-4 text-[var(--priority-could)]" />
            ) : (
              <ShieldAlert className="size-4 text-[var(--priority-should)]" />
            )}
            <span className="flex-1">
              {storage?.supported === false
                ? "This browser does not expose storage persistence."
                : storage?.persisted
                  ? "Storage is persistent — the browser will not evict it."
                  : "Storage is evictable — the browser may clear it under disk pressure."}
            </span>
            {storage?.supported !== false && !storage?.persisted ? (
              <Button size="sm" variant="outline" onClick={() => void enablePersistence()}>
                Request
              </Button>
            ) : null}
          </div>

          {storage?.usage !== undefined ? (
            <p className="flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
              <HardDrive className="size-3" />
              {formatBytes(storage.usage)} used of {formatBytes(storage.quota)} available
            </p>
          ) : null}
        </div>

        <Separator />

        {/* --- folder backups ------------------------------------------ */}
        {!backupsSupported() ? (
          /* Firefox and its derivatives ship no local-disk picker, so a page
             here simply cannot be given a folder. The snapshot leaves through
             the downloads folder instead — same file, same name, one click. */
          <div className="space-y-2">
            <Button onClick={() => onDownloadSnapshot()}>
              <Download className="size-4" />
              Download a snapshot
            </Button>
            <p className="text-xs text-muted-foreground">
              This browser does not let a page write to a folder you choose — Firefox and its
              derivatives support only storage the user cannot see, so automatic folder backups
              are not possible here. The snapshot downloads instead, named the way the{" "}
              <code className="font-mono">momentum-data</code> scripts expect, so you can drop it
              straight into your data repo and run <code className="font-mono">import</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={backup?.directoryName ? "outline" : "default"} disabled={busy} onClick={() => void pickFolder()}>
                <FolderOpen className="size-4" />
                {backup?.directoryName ? "Change folder" : "Choose a backup folder"}
              </Button>
              {backup?.directoryName ? (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => void backUpNow()}>
                    <Save className="size-4" />
                    Back up now
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void forgetBackupFolder().then(refresh)}
                  >
                    Stop
                  </Button>
                </>
              ) : null}
            </div>

            {backup?.directoryName ? (
              <p className="text-xs text-muted-foreground">
                Writing snapshots to <span className="font-medium">{backup.directoryName}</span>
                {backup.lastWrittenAt
                  ? ` · last saved ${new Date(backup.lastWrittenAt).toLocaleString()}`
                  : ""}
                . Point this at a folder that already syncs — Drive, Dropbox, Syncthing — and the
                backup leaves this machine on its own.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick a folder once and Momentum writes a timestamped JSON snapshot there as you
                work, keeping the last 30. The folder is remembered between sessions.
              </p>
            )}

            {backup?.needsPermission ? (
              <p className="rounded-md border border-[var(--priority-should)]/40 bg-[var(--priority-should)]/10 px-3 py-2 text-xs">
                The browser dropped write permission for that folder. Press “Back up now” to grant
                it again.
              </p>
            ) : null}

            {snapshots.length > 0 ? (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Snapshots
                </h4>
                <div className="max-h-40 space-y-0.5 overflow-y-auto">
                  {snapshots.map((snapshot) => (
                    <div
                      key={snapshot.name}
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {snapshot.savedAt.toLocaleString()}
                      </span>
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {formatBytes(snapshot.size)}
                      </span>
                      <button
                        type="button"
                        title="Restore this snapshot"
                        onClick={() => void restore(snapshot.name)}
                        className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      >
                        <RotateCcw className="size-3" />
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

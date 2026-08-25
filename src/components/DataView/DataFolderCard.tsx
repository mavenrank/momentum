import * as React from "react";
import { FolderOpen, HardDrive } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  chooseStoreLocation,
  getStoreLocation,
  isTauriShell,
} from "@/lib/persistence/tauriRepository";
import type { PlannerData } from "@/types/planner";

interface DataFolderCardProps {
  data: PlannerData;
}

/**
 * Where the planner store lives, and a button to move it.
 *
 * Visible only in the desktop shell — in a browser there is no path to show.
 * Surfacing it is not a nicety: pointing this at a folder Drive or Syncthing
 * already watches is the concrete thing the shell buys over a browser tab, and
 * a setting nobody can find is a setting nobody uses.
 */
export function DataFolderCard({ data }: DataFolderCardProps) {
  const [path, setPath] = React.useState<string | null>(null);
  const [isDefault, setIsDefault] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const { toast } = useToast();

  React.useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    void getStoreLocation().then((location) => {
      setPath(location.path);
      setIsDefault(location.isDefault);
    });
  }, []);

  if (!isTauriShell()) {
    return null;
  }

  async function change() {
    setBusy(true);
    setError("");
    try {
      const chosen = await chooseStoreLocation(data);
      if (!chosen) {
        return;
      }
      toast("Data folder changed. Reloading.");
      // The store is read once at startup, so the cleanest way to adopt a new
      // folder is to start again against it rather than to hot-swap a live
      // repository underneath the running app.
      window.location.reload();
    } catch (cause) {
      console.error("Momentum: could not change the data folder.", cause);
      setError("Could not use that folder. It may be read-only.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-4" />
          Data folder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="muted">{isDefault ? "Default location" : "Custom location"}</Badge>
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {path ?? "Locating…"}
          </p>
        </div>

        <Button variant="outline" disabled={busy} onClick={() => void change()}>
          <FolderOpen className="size-4" />
          Change folder
        </Button>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <p className="text-xs text-muted-foreground">
          Plain JSON, split by the month each task was created in — the same layout{" "}
          <code className="font-mono">scripts/momentum-data.mjs</code> reads, so the CLI works on
          this folder directly. Point it at something Drive, Syncthing or a NAS already watches and
          your planner is backed up without this app knowing anything about it. Choosing a folder
          that already holds a store adopts that store; choosing an empty one seeds it with what is
          loaded now.
        </p>
      </CardContent>
    </Card>
  );
}

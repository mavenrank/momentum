import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addDays, toDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { DailyTask } from "@/types/planner";

const PRESETS = [
  { label: "In 3 days", days: 3 },
  { label: "In 1 week", days: 7 },
  { label: "In 2 weeks", days: 14 },
];

interface FollowUpPromptProps {
  /** The just-completed task, or null when the prompt is closed. */
  task: DailyTask | null;
  onClose: () => void;
  onCreate: (title: string, scheduledDate?: string) => void;
}

export function FollowUpPrompt({ task, onClose, onCreate }: FollowUpPromptProps) {
  const [title, setTitle] = React.useState("");
  const [preset, setPreset] = React.useState<number | "custom" | null>(7);
  const [customDate, setCustomDate] = React.useState("");

  React.useEffect(() => {
    if (task) {
      setTitle(`Follow up: ${task.title}`);
      setPreset(7);
      setCustomDate(addDays(toDateKey(new Date()), 7));
    }
  }, [task]);

  function resolveDate(): string | undefined {
    if (preset === "custom") {
      return customDate || undefined;
    }
    return typeof preset === "number" ? addDays(toDateKey(new Date()), preset) : undefined;
  }

  return (
    <Dialog open={task !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Done. Schedule a follow-up?</DialogTitle>
          <DialogDescription>
            The follow-up links back to “{task?.title}” and can be scheduled now or left in the
            Pool.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Follow-up title"
        />

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((option) => (
            <Button
              key={option.days}
              type="button"
              size="sm"
              variant={preset === option.days ? "default" : "outline"}
              onClick={() => setPreset(option.days)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={preset === "custom" ? "default" : "outline"}
            onClick={() => setPreset("custom")}
          >
            Custom
          </Button>
          <Button
            type="button"
            size="sm"
            variant={preset === null ? "default" : "outline"}
            onClick={() => setPreset(null)}
          >
            Pool
          </Button>
        </div>

        <Input
          type="date"
          value={customDate}
          onChange={(event) => {
            setCustomDate(event.target.value);
            setPreset("custom");
          }}
          className={cn(preset !== "custom" && "opacity-60")}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button
            disabled={!title.trim()}
            onClick={() => onCreate(title.trim(), resolveDate())}
          >
            Create follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

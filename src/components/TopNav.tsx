import {
  CalendarDays,
  Database,
  ListChecks,
  ListTodo,
  Moon,
  NotebookPen,
  Settings,
  Sun,
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types/planner";

const NAV_ITEMS = [
  { id: "planner", label: "Planner", icon: ListTodo },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "habits", label: "Habits", icon: ListChecks },
  { id: "journal", label: "Journal", icon: NotebookPen },
  { id: "data", label: "Data", icon: Database },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{ id: ViewMode; label: string; icon: typeof Database }>;

interface TopNavProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Rendered on the right of the bar — the active view's own controls. */
  actions?: React.ReactNode;
}

/**
 * A single 44px bar replaces the old sidebar: the nav costs one row of vertical
 * space instead of a permanent column, and collapses to icons when narrow.
 */
export function TopNav({ mode, onChange, actions }: TopNavProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 flex h-11 shrink-0 items-center gap-2 border-b bg-background/85 px-2 backdrop-blur-md">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground"
      >
        M
      </span>
      <span className="sr-only">Momentum</span>

      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onChange(item.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {/* The label is dropped on narrow screens; the tooltip covers it. */}
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="lg:hidden">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggleTheme}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </TooltipContent>
      </Tooltip>
    </header>
  );
}

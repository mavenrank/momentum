import type { LucideIcon } from "lucide-react";
import type { ViewMode } from "../../types/planner";
import "./ModeTabs.css";

interface ModeTabsProps {
  activeMode: ViewMode;
  modes: Array<{ id: ViewMode; label: string; icon: LucideIcon }>;
  onChange: (mode: ViewMode) => void;
}

export function ModeTabs({ activeMode, modes, onChange }: ModeTabsProps) {
  return (
    <nav className="mode-tabs" aria-label="Planner modes">
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            className={mode.id === activeMode ? "mode-tab active" : "mode-tab"}
            key={mode.id}
            onClick={() => onChange(mode.id)}
            title={mode.label}
            type="button"
          >
            <Icon size={18} />
            <span>{mode.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

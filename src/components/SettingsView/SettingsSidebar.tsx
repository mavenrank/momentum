import * as React from "react";
import {
  BookOpen,
  Database,
  FolderTree,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type SettingsSection = "guide" | "domains" | "areas" | "pursuits" | "customization" | "data";

const groups = [
  {
    label: "Organization",
    items: [
      { id: "guide", label: "How it works", icon: BookOpen },
      { id: "domains", label: "Domains", icon: Layers3 },
      { id: "areas", label: "Areas", icon: FolderTree },
      { id: "pursuits", label: "Pursuits", icon: Waypoints },
    ],
  },
  {
    label: "Application",
    items: [
      { id: "customization", label: "Customization", icon: SlidersHorizontal },
      { id: "data", label: "Data", icon: Database },
    ],
  },
] satisfies Array<{ label: string; items: Array<{ id: SettingsSection; label: string; icon: typeof BookOpen }> }>;

interface SettingsSidebarProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

function initialExpanded() {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(min-width: 768px)").matches && localStorage.getItem("momentum.settings.sidebar") !== "collapsed";
  } catch {
    return true;
  }
}

export function SettingsSidebar({ section, onSectionChange }: SettingsSidebarProps) {
  const [expanded, setExpanded] = React.useState(initialExpanded);

  function toggle() {
    setExpanded((current) => {
      const next = !current;
      try { localStorage.setItem("momentum.settings.sidebar", next ? "expanded" : "collapsed"); } catch { /* Optional layout preference. */ }
      return next;
    });
  }

  return <>
    {expanded ? <button type="button" aria-label="Close settings sidebar" className="absolute inset-0 z-10 bg-background/65 backdrop-blur-[2px] md:hidden" onClick={toggle} /> : null}
    <aside className={cn(
      "absolute inset-y-0 left-0 z-20 flex shrink-0 flex-col border-r bg-muted/20 transition-[width] duration-200 motion-reduce:transition-none md:relative",
      expanded ? "w-56 lg:w-60" : "w-14",
    )} aria-label="Settings sidebar">
      <div className={cn("flex h-16 shrink-0 items-center border-b", expanded ? "justify-between px-3" : "justify-center")}>
        {expanded ? <div className="min-w-0"><p className="text-sm font-semibold tracking-tight">Settings</p><p className="text-[11px] text-muted-foreground">Workspace & preferences</p></div> : null}
        <button type="button" aria-label={expanded ? "Collapse settings sidebar" : "Expand settings sidebar"} aria-expanded={expanded} onClick={toggle}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {expanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4" aria-label="Settings">
        {groups.map((group) => <div key={group.label}>
          {expanded ? <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p> : <div className="mx-2 mb-2 border-t" aria-hidden />}
          <div className="space-y-0.5">{group.items.map((item) => {
            const Icon = item.icon;
            const selected = section === item.id;
            return <button key={item.id} type="button" title={!expanded ? item.label : undefined} aria-label={item.label} aria-current={selected ? "page" : undefined}
              onClick={() => { onSectionChange(item.id); if (window.matchMedia("(max-width: 767px)").matches && expanded) toggle(); }}
              className={cn("flex h-9 w-full items-center gap-3 rounded-md text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                expanded ? "px-2.5" : "justify-center", selected ? "bg-primary/15 font-semibold text-foreground hover:bg-primary/20" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
            ><Icon className={cn("size-4 shrink-0", selected && "text-primary")} />{expanded ? <span className="truncate">{item.label}</span> : null}</button>;
          })}</div>
        </div>)}
      </nav>
      {expanded ? <p className="border-t px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Your layout choices stay on this device. Tasks and organization live in your data.</p> : null}
    </aside>
  </>;
}

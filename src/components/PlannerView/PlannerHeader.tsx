import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Width of the "Today" / "This week" button.
 *
 * Fixed, so the two lenses produce identically sized stepper groups — otherwise
 * the longer label in the week view pushes every button beside it sideways.
 */
export const STEPPER_LABEL_WIDTH = "w-28";

interface PlannerHeaderProps {
  title: ReactNode;
  subtitle: ReactNode;
  /** View-specific controls, laid out to the left of the lens switch. */
  children?: ReactNode;
  /** The Today/Week switch — pinned to the right edge in every lens. */
  lensControl?: ReactNode;
  className?: string;
}

/**
 * One header shell for every planner lens.
 *
 * Both lenses used to build their own, so the shared controls landed at
 * different heights and different x positions depending on which view you were
 * in — you could not build muscle memory for a button that moved when you
 * switched to the view you wanted to press it in. Fixed height, and the lens
 * switch anchored last against the right edge, so what the lenses share stays
 * put across the switch.
 */
export function PlannerHeader({
  title,
  subtitle,
  children,
  lensControl,
  className,
}: PlannerHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 backdrop-blur",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold leading-tight tracking-tight">{title}</h2>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {children}
        {lensControl}
      </div>
    </header>
  );
}

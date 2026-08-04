import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * A menu anchored to the pointer rather than to an element.
 *
 * Radix ships a ContextMenu primitive, but it wants to own the trigger element —
 * task cards are already draggable, focusable and spread with dnd-kit listeners,
 * so wrapping them in another trigger fights for the same events. This opens
 * from a plain `onContextMenu` handler instead: the caller stores the pointer
 * position and renders the menu there.
 */

export interface ContextMenuPosition {
  x: number;
  y: number;
}

/** Distance kept between the menu and the edge of the window. */
const VIEWPORT_MARGIN = 8;

interface ContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function ContextMenu({ position, onClose, children, className }: ContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  // Rendered off-screen for one frame so the real size can be measured before
  // it is placed — otherwise a menu near the bottom edge visibly jumps.
  const [placed, setPlaced] = React.useState<ContextMenuPosition | null>(null);

  React.useLayoutEffect(() => {
    if (!position) {
      setPlaced(null);
      return;
    }

    const menu = menuRef.current;
    if (!menu) {
      return;
    }

    const { width, height } = menu.getBoundingClientRect();
    const maxX = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxY = window.innerHeight - height - VIEWPORT_MARGIN;

    setPlaced({
      x: Math.max(VIEWPORT_MARGIN, Math.min(position.x, maxX)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(position.y, maxY)),
    });
  }, [position]);

  React.useEffect(() => {
    if (!position) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    // Scrolling the board would leave the menu stranded beside the wrong card.
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [position, onClose]);

  // Move focus in so the menu can be dismissed with Escape straight away.
  React.useEffect(() => {
    if (placed) {
      menuRef.current?.focus();
    }
  }, [placed]);

  if (!position) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        left: placed?.x ?? position.x,
        top: placed?.y ?? position.y,
        // Invisible until measured, but still laid out so it can be measured.
        visibility: placed ? "visible" : "hidden",
      }}
      className={cn(
        "fixed z-50 max-h-[80vh] w-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export const ContextMenuItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }
>(function ContextMenuItem({ className, destructive, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50",
        destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      {...props}
    />
  );
});

export function ContextMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-2 pb-0.5 pt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}

/** A row of small pill buttons — used for priority, area and schedule presets. */
export function ContextMenuChips({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-wrap gap-1 px-2 pb-1.5 pt-0.5", className)} {...props} />
  );
}

export const ContextMenuChip = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function ContextMenuChip({ className, active, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "rounded border px-1.5 py-0.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
        active
          ? "border-ring bg-accent font-medium text-accent-foreground"
          : "border-border text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});

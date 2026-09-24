import * as React from "react";

import { cn } from "@/lib/utils";

const DURATION_MS = 180;

export interface RollingTextProps {
  /** The text to display. Changing it triggers the roll. */
  value: string;
  /**
   * "up" rolls the old value out through the top and brings the new one up from
   * below — the direction of moving forward. Omit to infer it by comparing the
   * old and new values, which works for zero-padded dates and years.
   */
  direction?: "up" | "down" | "left" | "right";
  className?: string;
}

/**
 * Swaps text like an odometer: the outgoing value leaves in the same direction
 * the incoming one arrives from, so stepping through months or years reads as
 * movement rather than a flicker.
 */
export function RollingText({ value, direction, className }: RollingTextProps) {
  const [current, setCurrent] = React.useState(value);
  const [outgoing, setOutgoing] = React.useState<string | null>(null);
  const [roll, setRoll] = React.useState<"up" | "down" | "left" | "right">("up");

  // The clear-out timer lives in a ref rather than an effect cleanup: any
  // unrelated re-render during the animation would otherwise run the cleanup,
  // cancel the timer, and leave the outgoing value on screen for good.
  const clearTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (value === current) {
      return;
    }

    setRoll(direction ?? (value > current ? "up" : "down"));
    setOutgoing(current);
    setCurrent(value);

    if (clearTimer.current !== null) {
      window.clearTimeout(clearTimer.current);
    }
    clearTimer.current = window.setTimeout(() => {
      setOutgoing(null);
      clearTimer.current = null;
    }, DURATION_MS);
  }, [value, current, direction]);

  React.useEffect(() => {
    return () => {
      if (clearTimer.current !== null) {
        window.clearTimeout(clearTimer.current);
      }
    };
  }, []);

  return (
    <span className={cn("relative inline-flex overflow-hidden", className)}>
      {/* An invisible copy holds the box open so the label never collapses
          mid-animation while both values are absolutely positioned. */}
      <span aria-hidden className="invisible whitespace-nowrap">
        {current.length >= (outgoing?.length ?? 0) ? current : outgoing}
      </span>

      <span
        key={current}
        className={cn(
          "absolute inset-0 whitespace-nowrap",
          outgoing !== null && `roll-in-${roll}`,
        )}
      >
        {current}
      </span>

      {outgoing !== null ? (
        <span
          key={`${outgoing}-out`}
          aria-hidden
          className={cn(
            "absolute inset-0 whitespace-nowrap",
            `roll-out-${roll}`,
          )}
        >
          {outgoing}
        </span>
      ) : null}
    </span>
  );
}

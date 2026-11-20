import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Marcador de carga shimmer respetuoso con `prefers-reduced-motion` (`DSN-001 §8`).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse dsn-animate-shimmer rounded-md bg-[var(--dsn-surface-secondary)]",
        className,
      )}
      {...props}
    />
  );
}

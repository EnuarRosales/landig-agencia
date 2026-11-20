import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * Variantes semánticas de etiqueta/insignia (`DSN-001`).
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]",
        accent:
          "border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)]",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        error:
          "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
        destructive:
          "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
        outline:
          "border-[var(--dsn-border)] bg-transparent text-[var(--dsn-text)]",
        amber:
          "border-[var(--dsn-accent-amber)]/30 bg-[var(--dsn-accent-amber)]/10 text-[var(--dsn-accent-amber)]",
        purple:
          "border-[var(--dsn-accent-purple)]/30 bg-[var(--dsn-accent-purple)]/10 text-[var(--dsn-accent-purple)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Insignia de estado o categoría semántica conectada a tokens `--dsn-*`.
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
